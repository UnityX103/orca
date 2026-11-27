// Attachment payload rules for a stashed draft: real bytes count, body prose does not.

import {
  MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS,
  type StoredNativeChatStashDraft
} from './native-chat-prompt-stash-storage'
import type { NativeChatComposerDraftImage } from './native-chat-composer-draft-storage'
import { basename } from '@/lib/path'

/** Measures one attachment's real on-disk payload; unknown sizes return 0 so its reference counts. */
export type StashAttachmentMeasure = (image: NativeChatComposerDraftImage) => Promise<number>

/** The name a file keeps in its "attach again" placeholder. */
export function stashAttachmentName(path: string): string {
  return basename(path) || path
}

/**
 * Convert attachments past the per-entry payload budget into named placeholders. Both images and
 * managed pasted-text files share the one budget; the body text is left out of it: the limit
 * exists for attachment payload, not prose.
 */
export async function fitStashDraft(
  draft: StoredNativeChatStashDraft,
  measure: StashAttachmentMeasure
): Promise<{ draft: StoredNativeChatStashDraft; droppedAttachmentNames: readonly string[] }> {
  const droppedAttachmentNames: string[] = []
  let used = 0
  const keep = (cost: number): boolean => {
    if (used + cost > MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS) {
      return false
    }
    used += cost
    return true
  }
  const referenceCost = (id: string, path: string, connectionId?: string): number =>
    JSON.stringify([id, path, connectionId ?? '']).length

  const images: NativeChatComposerDraftImage[] = []
  for (const image of draft.images) {
    const name = image.unavailableName ?? stashAttachmentName(image.path)
    if (image.unavailableName !== undefined) {
      images.push(image)
      continue
    }
    const size = await measure(image).catch(() => 0)
    const cost = size > 0 ? size : referenceCost(image.id, image.path, image.connectionId)
    if (keep(cost)) {
      images.push(image)
      continue
    }
    droppedAttachmentNames.push(name)
    images.push({ id: image.id, path: '', unavailableName: name })
  }

  const pastedTextFiles: Record<string, string> = {}
  const pastedTextUnavailable: Record<string, string> = { ...draft.pastedTextUnavailable }
  for (const [id, path] of Object.entries(draft.pastedTextFiles ?? {})) {
    if (pastedTextUnavailable[id]) {
      continue
    }
    const name = stashAttachmentName(path)
    const size = await measure({ id, path }).catch(() => 0)
    const cost = size > 0 ? size : referenceCost(id, path)
    if (keep(cost)) {
      pastedTextFiles[id] = path
      continue
    }
    droppedAttachmentNames.push(name)
    pastedTextUnavailable[id] = name
  }

  return {
    draft: {
      ...draft,
      images,
      pastedTextFiles: Object.keys(pastedTextFiles).length ? pastedTextFiles : undefined,
      pastedTextUnavailable: Object.keys(pastedTextUnavailable).length
        ? pastedTextUnavailable
        : undefined
    },
    droppedAttachmentNames
  }
}
