import type { z } from 'zod'
import type { WorkerStartParams } from '../../../../../../../shared/rpc-contract/orchestration/orchestration-worker-start-params'
import type { OrcaRuntimeService } from '../../../../../orca-runtime'
import type { OrchestrationDb } from '../../../../../orchestration/db/orchestration-db'
import type {
  DispatchContextRow,
  RunRow,
  TaskRow
} from '../../../../../orchestration/db/orchestration-records'
import type { OrchestrationEntryCaller } from '../../../../../orchestration/addressing/orchestration-caller-identity'
import type { OrchestrationPartyIdentity as OrchestrationCallerIdentity } from '../../../../../../../shared/orchestration/mailbox/orchestration-party-identity'
import type { AgentLaunchModeReceipt as WorkerStartModeReceipt } from '../../../../../../../shared/agent-launch/contracts/agent-launch-intent'
import type { WorkerStartMutation } from './worker-start-mutation'
import type { WorkerFollowUp } from '../follow-up/worker-follow-up-placement'

export type WorkerStartInput = z.infer<typeof WorkerStartParams>

export type LocalWorkerStartArgs = {
  params: WorkerStartInput
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  /** Called only once effect-free validation passes, so a refused start binds no new Run. */
  bindRun: () => RunRow
  taskDeps: string[] | undefined
  coordinator: OrchestrationCallerIdentity | null
  callerSession?: OrchestrationEntryCaller
  personWorktree?: { id: string; repoId: string }
  existingTask?: TaskRow
  orchestrationMutation?: WorkerStartMutation
  /** Settings-driven; the executing host still gets to refuse below. */
  mode: WorkerStartModeReceipt
  /** Stamped on the Dispatch so the workers this one starts start as chats too. */
  chatLineage?: boolean
  /** Set when a worker starts its own helper; the helper reports to this Dispatch. */
  helperCreator?: DispatchContextRow
  followUp?: WorkerFollowUp
}
