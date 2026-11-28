import { z } from 'zod'
import { lazyZodSchema } from '../../schema/lazy-zod-schema'
import {
  isNativeChatVisualFileName,
  isNativeChatVisualPath
} from '../../native-chat/visuals/native-chat-visual-directive'
import { SessionId } from './structured-agent-session-identifiers'

// Read visuals on their owning host. `file` is a bare scratch-folder name; `path` is an absolute host path a Codex
// reference named, which the host still confines to the session's workspace or scratch folder.

/** Content revision: hex digest of the file's bytes. */
const Revision = lazyZodSchema(() => z.string().regex(/^[0-9a-f]{16,64}$/))

export const ReadVisualParams = lazyZodSchema(() =>
  z
    .object({
      sessionId: SessionId,
      file: z.string().refine(isNativeChatVisualFileName, 'Invalid visual file name').optional(),
      path: z.string().refine(isNativeChatVisualPath, 'Invalid visual path').optional(),
      // The revision the client already holds; a match answers `unchanged` without the bytes.
      knownRevision: Revision.optional()
    })
    .strict()
    .refine((params) => params.file !== undefined || params.path !== undefined, {
      message: 'A visual read needs a file or a path'
    })
)

export type AgentSessionReadVisualParams = z.infer<typeof ReadVisualParams>

/** Positive host observations only; transport loss or an older host means unavailable/retryable, never these errors. */
export const AGENT_SESSION_VISUAL_READ_ERRORS = [
  'session_not_found',
  'unsupported_location',
  'not_found',
  'not_a_file',
  'outside_folder',
  'too_large',
  'not_text'
] as const

export type AgentSessionVisualReadError = (typeof AGENT_SESSION_VISUAL_READ_ERRORS)[number]

/** `path`: the visual's absolute path on the owning host. */
export type AgentSessionReadVisualResult =
  | { ok: true; revision: string; sizeBytes: number; path?: string; html: string }
  | { ok: true; revision: string; sizeBytes: number; path?: string; unchanged: true }
  | { ok: false; error: AgentSessionVisualReadError }
