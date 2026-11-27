import type { AppState } from '../../../store/types'
import { resolveNativeChatDraftOwner } from './native-chat-draft-owner'
import { resolveWorktreeOperationRoute } from '../../../lib/workspace/ownership/worktree-operation-route'
import type { NativeChatStashScope } from './native-chat-prompt-stash-storage'

/** The workspace whose chats share a stash, from the draft's owner or the structured transport's worktree. */
export function resolveNativeChatStashScope(
  state: AppState,
  draftScopeKey: string,
  fallbackWorkspaceId?: string
): NativeChatStashScope | null {
  const owner = resolveNativeChatDraftOwner(state, draftScopeKey)
  if (owner) {
    return { workspaceId: owner.workspaceId, executionHostId: owner.executionHostId }
  }
  if (!fallbackWorkspaceId) {
    return null
  }
  const route = resolveWorktreeOperationRoute(state, fallbackWorkspaceId)
  return route && route.executionHostId
    ? { workspaceId: fallbackWorkspaceId, executionHostId: route.executionHostId }
    : null
}
