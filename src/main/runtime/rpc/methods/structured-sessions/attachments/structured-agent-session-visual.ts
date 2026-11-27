// Resolve readVisual roots from host records; clients supply a session id plus either a bare scratch name or an
// absolute path a Codex reference named, confined to the session's workspace or scratch folder.
// Older hosts lack the method (mobile may see forbidden); clients show unavailable.

import { LOCAL_EXECUTION_HOST_ID } from '../../../../../../shared/execution-host/execution-host'
import {
  ReadVisualParams,
  type AgentSessionReadVisualResult
} from '../../../../../../shared/rpc-contract/structured-agent-session/agent-session-visual-params'
import { nativeChatScratchFolderFor } from '../../../../../native-chat/conversation-files/native-chat-scratch-folder'
import { readNativeChatVisualFile } from '../../../../../native-chat/conversation-files/native-chat-visual-file-read'
import { getProfileUserDataPath } from '../../../../../orca-profiles/profile-storage-paths'
import { defineMethod } from '../../../core'
import { requireInstalledStructuredHost } from '../creation/structured-agent-session-gate'

export const STRUCTURED_AGENT_SESSION_VISUAL_METHODS = [
  defineMethod({
    name: 'agentSession.readVisual',
    permission: 'workspace',
    params: ReadVisualParams,
    handler: async (params, ctx): Promise<AgentSessionReadVisualResult> => {
      const host = await requireInstalledStructuredHost(ctx)
      const record = host.deps.store.getConversation(params.sessionId)
      if (!record) {
        return { ok: false, error: 'session_not_found' }
      }
      // Only host-local structured sessions have scratch folders this process can read.
      if (
        record.location.executionHostId !== LOCAL_EXECUTION_HOST_ID ||
        record.location.wslDistro
      ) {
        return { ok: false, error: 'unsupported_location' }
      }
      // The same state directory the chat host and its journal are opened in on this process.
      const scratchFolder = nativeChatScratchFolderFor(getProfileUserDataPath(), params.sessionId)
      // A Codex absolute path may sit in the session's own workspace; anything else stays unreadable.
      const workspaceRoot =
        params.path !== undefined
          ? await host.deps.resolveWorkspacePath?.(record.location.workspaceId)
          : undefined
      return readNativeChatVisualFile({
        scratchFolder,
        file: params.file,
        path: params.path,
        workspaceRoot,
        knownRevision: params.knownRevision
      })
    }
  })
]
