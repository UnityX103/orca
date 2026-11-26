// Whether this build may dispatch a CNB record to a native BoBot chat: the runtime record's API,
// the target workspace's host, and a chat-capable BoBot there. Real limits are shown, not assumed.
import { useAppStoreWithHostStatuses } from '@/store/slices/runtime-status/views/use-runtime-status-view'
import { hostCapabilitiesFrom } from '@/lib/agent-session/launch/routing/agent-launch-route-input'
import {
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../../../shared/execution-host/execution-host'
import { STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY } from '../../../../../../shared/agent-session/capabilities/agent-session-runtime-capabilities'

/** Why the panel cannot dispatch here, in the terms its notice shows. */
export type BoBotChatUnavailableReason =
  | 'api-missing'
  | 'no-workspace'
  | 'unsupported-host'
  | 'capabilities-unknown'
  | 'chat-unsupported'

export type BoBotChatAvailability =
  | { supported: true }
  | { supported: false; reason: BoBotChatUnavailableReason }

function bobotChatAvailabilityFor(args: {
  apiSupported: boolean
  hasWorkspace: boolean
  hostId: ExecutionHostId | null | undefined
  hostCapabilities: readonly string[] | null
}): BoBotChatAvailability {
  if (!args.apiSupported) {
    return { supported: false, reason: 'api-missing' }
  }
  if (!args.hasWorkspace) {
    return { supported: false, reason: 'no-workspace' }
  }
  const hostId = args.hostId ?? LOCAL_EXECUTION_HOST_ID
  if (hostId !== LOCAL_EXECUTION_HOST_ID) {
    return { supported: false, reason: 'unsupported-host' }
  }
  if (args.hostCapabilities === null) {
    return { supported: false, reason: 'capabilities-unknown' }
  }
  return args.hostCapabilities.includes(STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY)
    ? { supported: true }
    : { supported: false, reason: 'chat-unsupported' }
}

/** The workspace's host capabilities as this client reads them now; `null` while unestablished. */
export function useCnbDispatchChatAvailability(args: {
  apiSupported: boolean
  worktreeId: string | null
  hostId: ExecutionHostId | null | undefined
}): BoBotChatAvailability {
  const hostId = args.hostId ?? LOCAL_EXECUTION_HOST_ID
  const reads = args.apiSupported && Boolean(args.worktreeId)
  const capabilities = useAppStoreWithHostStatuses(
    (_state, statuses) => (reads ? hostCapabilitiesFrom(statuses, hostId) : null),
    (a, b) => a === b || (a !== null && b !== null && a.join(',') === b.join(','))
  )
  return bobotChatAvailabilityFor({
    apiSupported: args.apiSupported,
    hasWorkspace: Boolean(args.worktreeId),
    hostId,
    hostCapabilities: capabilities
  })
}
