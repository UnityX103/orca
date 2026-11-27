// A restore claim: two composers (independent `busy` refs) must not both read and merge one entry.

import {
  nativeChatStashScopeKey,
  type NativeChatStashScope,
  type StoredNativeChatStashEntry
} from './native-chat-prompt-stash-storage'
import { readNativeChatStashEntries } from './native-chat-prompt-stash-store'

// Claimed synchronously, so a same-tick second restorer cannot pass the guard.
const entryClaims = new Set<string>()

export type NativeChatStashClaim = {
  /** The latest stored copy, not the possibly-stale value the caller rendered. */
  readonly entry: StoredNativeChatStashEntry
  /** Drop the claim without deleting the entry (a failed restore keeps it for a retry). */
  release: () => void
}

/**
 * Claim one entry for restore. Returns the latest stored copy, or null when it is gone or another
 * composer is restoring it. The caller deletes the entry itself only after its own write lands.
 */
export function claimNativeChatStashEntry(
  scope: NativeChatStashScope,
  entryId: string
): NativeChatStashClaim | null {
  const claimKey = `${nativeChatStashScopeKey(scope)}\n${entryId}`
  if (entryClaims.has(claimKey)) {
    return null
  }
  const entry = readNativeChatStashEntries(scope).find((candidate) => candidate.id === entryId)
  if (!entry) {
    return null
  }
  entryClaims.add(claimKey)
  return { entry, release: () => entryClaims.delete(claimKey) }
}

export function clearNativeChatStashClaimsForTests(): void {
  entryClaims.clear()
}
