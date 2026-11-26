import { workspaceHasCnbWorkItem } from '../../shared/cnb/cnb-work-item-workspace'
import type {
  CnbTaskDispatch,
  CnbTaskDispatchRequest,
  CnbTaskDispatchTarget
} from '../../shared/cnb/cnb-task-dispatch'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host/execution-host'
import { decideAgentLaunchMode } from '../agent-launch/agent-launch-mode'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { OrchestrationDb } from '../runtime/orchestration/db/orchestration-db'
import type {
  DispatchContextRow,
  WorkerDispatchRow
} from '../runtime/orchestration/db/orchestration-records'
import { resolveStructuredWorkerIdentity } from '../runtime/orchestration/terminal-authority/structured-sessions/structured-worker-authority'
import { WORKER_START_VOCABULARY } from '../runtime/rpc/methods/orchestration/structured-workers/orchestration-worker-start-mode'
import { projectFleetWorker } from '../runtime/rpc/methods/orchestration/worker/observation/worker-observation'
import { assertWorkerStartTaskSpecWithinPromptBudget } from '../runtime/rpc/methods/orchestration/worker/start/admission/worker-start-prompt-budget'
import { startLocalWorker } from '../runtime/rpc/methods/orchestration/worker/start/local-worker-start'
import { issueWebUrl, pullWebUrl } from './task-schema'

function originRef(repository: string, target: CnbTaskDispatchTarget): string {
  return `cnb-work-item:${repository.toLowerCase()}:${target.type}:${target.number}`
}

function latestDispatch(db: OrchestrationDb, origin: string) {
  const row = db.db
    .prepare(
      `SELECT d.id, COALESCE(w.worktree_id,
         CASE WHEN json_valid(w.start_options)
           THEN json_extract(w.start_options, '$.resolvedWorktreeId') END) AS worktree_id
       FROM dispatch_contexts d JOIN worker_dispatches w ON w.dispatch_id = d.id
       WHERE d.origin_ref = ? ORDER BY d.rowid DESC LIMIT 1`
    )
    .get(origin)
  if (typeof row?.id !== 'string' || typeof row.worktree_id !== 'string') {
    return null
  }
  const dispatch = db.getDispatchContextById(row.id)
  const worker = db.getWorkerDispatch(row.id)
  return dispatch && worker ? { dispatch, worker, worktreeId: row.worktree_id } : null
}

function dispatchStatus(
  runtime: OrcaRuntimeService,
  db: OrchestrationDb,
  dispatch: DispatchContextRow,
  worker: WorkerDispatchRow
): CnbTaskDispatch['status'] {
  const projection = projectFleetWorker(runtime, db, dispatch.id)
  if (projection?.outcome === 'succeeded' || worker.state === 'succeeded') {
    return 'completed'
  }
  if (['failed', 'circuit_broken'].includes(dispatch.status)) {
    return 'failed'
  }
  if (worker.state === 'starting') {
    return 'starting'
  }
  if (!projection || projection.liveness.verdict !== 'live') {
    return 'unknown'
  }
  const { activity } = projection.stage
  if (
    activity === 'blocked' ||
    projection.attention.categories.some((category) =>
      ['approval', 'input', 'guidance'].includes(category)
    )
  ) {
    return 'waiting'
  }
  if (activity === 'working') {
    return 'working'
  }
  if (worker.state === 'ready' && (activity === 'waiting' || activity === 'done')) {
    return 'idle'
  }
  return 'unknown'
}

function dispatchSnapshot(runtime: OrcaRuntimeService, origin: string): CnbTaskDispatch | null {
  const db = runtime.getOrchestrationDb()
  const latest = latestDispatch(db, origin)
  if (!latest) {
    return null
  }
  const { dispatch, worker, worktreeId } = latest
  const task = db.getTask(dispatch.task_id)
  const handle = worker.agent_terminal_handle
  const status = dispatchStatus(runtime, db, dispatch, worker)
  return {
    runId: dispatch.run_id,
    taskId: dispatch.task_id,
    dispatchId: dispatch.id,
    worktreeId,
    sessionId:
      dispatch.assignee_orca_session_id ??
      (handle ? (resolveStructuredWorkerIdentity(handle, db)?.sessionId ?? null) : null),
    status,
    error: worker.last_error ?? dispatch.last_failure,
    canRetry:
      dispatch.status === 'failed' &&
      ['failed', 'stopped', 'abandoned'].includes(worker.state) &&
      (task?.status === 'failed' || task?.status === 'blocked')
  }
}

export function readCnbTaskDispatch(
  runtime: OrcaRuntimeService,
  repository: string,
  target: CnbTaskDispatchTarget
): CnbTaskDispatch | null {
  return dispatchSnapshot(runtime, originRef(repository, target))
}

export function createCnbTaskDispatcher(runtime: OrcaRuntimeService) {
  const pending = new Map<string, Promise<CnbTaskDispatch>>()
  return (repository: string, request: CnbTaskDispatchRequest): Promise<CnbTaskDispatch> => {
    const origin = originRef(repository, request)
    const existing = pending.get(origin)
    if (existing) {
      return existing
    }
    const started = startCnbTask(runtime, repository, origin, request).finally(() => {
      pending.delete(origin)
    })
    pending.set(origin, started)
    return started
  }
}

async function startCnbTask(
  runtime: OrcaRuntimeService,
  repository: string,
  origin: string,
  request: CnbTaskDispatchRequest
): Promise<CnbTaskDispatch> {
  const previous = dispatchSnapshot(runtime, origin)
  if (previous && !request.retryOf) {
    return previous
  }
  if (
    request.retryOf &&
    (!previous?.canRetry ||
      previous.dispatchId !== request.retryOf ||
      previous.worktreeId !== request.worktreeId)
  ) {
    throw new Error('The selected CNB dispatch can no longer be retried in this workspace.')
  }
  const worktree = await runtime.showManagedTerminalWorkspace(
    `id:${request.worktreeId}`,
    LOCAL_EXECUTION_HOST_ID
  )
  const { repoId, type, number } = request
  const url = type === 'pr' ? pullWebUrl(repository, number) : issueWebUrl(repository, number)
  if (!workspaceHasCnbWorkItem(worktree, repoId, type, number, url)) {
    throw new Error('The CNB work item is not attached to the selected workspace.')
  }
  const title = `CNB ${repository} ${type === 'pr' ? 'PR' : 'Issue'} #${number} · ${request.title}`
  const db = runtime.getOrchestrationDb()
  const existingTask = previous ? db.getTask(previous.taskId) : undefined
  const existingRun = previous ? db.getRun(previous.runId) : undefined
  if (previous && (!existingTask || !existingRun)) {
    throw new Error('The original CNB task is no longer available.')
  }
  const spec = existingTask?.spec ?? `${title}\n${url}\n\n${request.spec}`
  await assertWorkerStartTaskSpecWithinPromptBudget(spec)
  const mode = decideAgentLaunchMode({
    placement: { agent: 'bobot' },
    settings: runtime.getClientSettings(),
    surface: 'chat',
    vocabulary: WORKER_START_VOCABULARY
  })
  await startLocalWorker({
    params: {
      from: '',
      worktree: `id:${worktree.id}`,
      agent: 'bobot',
      origin,
      ...(existingTask
        ? { task: existingTask.id, retryOf: request.retryOf }
        : { spec, taskTitle: title })
    },
    runtime,
    db,
    bindRun: () =>
      existingRun ??
      db.createRun({ objective: title, coordinatorHandle: null, coordinatorPaneKey: null }),
    taskDeps: undefined,
    coordinator: null,
    personWorktree: worktree,
    existingTask,
    mode
  })
  const started = dispatchSnapshot(runtime, origin)
  if (!started) {
    throw new Error('Orca could not read the CNB task dispatch.')
  }
  if (started.sessionId && started.status !== 'failed') {
    db.retainWorkerTerminalResource(started.dispatchId)
  }
  return started
}
