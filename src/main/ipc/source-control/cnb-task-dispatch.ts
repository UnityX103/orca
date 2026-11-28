import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { lazyZodSchema } from '../../../shared/schema/lazy-zod-schema'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host/execution-host'
import { ORCHESTRATION_WORKER_START_TASK_SPEC_MAX_BYTES } from '../../../shared/orchestration/workers/orchestration-worker-start-prompt-budget'
import type { Store } from '../../persistence/loading-store/store'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { getStoredRepoExecutionHostId } from '../../workspaces/execution-host/repo-execution-host'
import { createCnbTaskDispatcher, readCnbTaskDispatch } from '../../cnb/task-dispatch'

const targetSchema = lazyZodSchema(() =>
  z.object({
    repoId: z.string().min(1).max(512),
    type: z.enum(['issue', 'pr']),
    number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
  })
)

const startSchema = lazyZodSchema(() =>
  targetSchema
    .extend({
      worktreeId: z.string().min(1).max(8192),
      title: z.string().trim().min(1).max(512),
      spec: z.string().trim().max(ORCHESTRATION_WORKER_START_TASK_SPEC_MAX_BYTES),
      retryOf: z
        .string()
        .regex(/^ctx_[0-9a-f]+$/)
        .optional()
    })
    .refine(({ retryOf, spec }) => Boolean(retryOf || spec), {
      path: ['spec'],
      message: 'Describe what BoBot should do.'
    })
)

function assertMainFrame(event: IpcMainInvokeEvent): void {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('CNB task dispatch must originate from the current main frame.')
  }
}

export function registerCnbTaskDispatchHandlers(
  runtime: OrcaRuntimeService,
  store: Store,
  resolveRepoSlug: (repoId: string) => Promise<string | null>
): void {
  const dispatch = createCnbTaskDispatcher(runtime)
  const localRepoSlug = (repoId: string): Promise<string | null> => {
    const repo = store.getRepo(repoId)
    if (!repo || getStoredRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
      return Promise.resolve(null)
    }
    return resolveRepoSlug(repoId)
  }
  ipcMain.handle('cnb:task-dispatch-get', async (event, payload: unknown) => {
    assertMainFrame(event)
    const target = targetSchema.parse(payload)
    const repository = await localRepoSlug(target.repoId)
    return repository ? readCnbTaskDispatch(runtime, repository, target) : null
  })
  ipcMain.handle('cnb:task-dispatch-start', async (event, payload: unknown) => {
    assertMainFrame(event)
    const request = startSchema.parse(payload)
    const repository = await localRepoSlug(request.repoId)
    if (!repository) {
      throw new Error('Select a CNB project registered on this Orca host.')
    }
    return dispatch(repository, request)
  })
}
