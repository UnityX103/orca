// Helpers for the composer's stash hook: payload measurement and restored-draft merging.

import { promptTextContent } from '../editor/native-chat-prompt-document-text'
import { findMissingNativeChatComposerDraftImages } from '../../drafts/native-chat-composer-draft-image-check'
import { basename } from '@/lib/path'
import type {
  NativeChatComposerDraft,
  NativeChatComposerDraftImage
} from '../../drafts/native-chat-composer-draft-storage'
import type { StoredNativeChatStashDraft } from '../../drafts/native-chat-prompt-stash-storage'
import {
  readNativeChatComposerDraft,
  updateNativeChatComposerDraft
} from '../../drafts/native-chat-composer-draft-store'
import { sameNativeChatComposerDraftDocument } from '../../drafts/native-chat-composer-draft-comparison'
import { withIndependentNativeChatComposerDraft } from '../../drafts/native-chat-composer-draft-addition'
import type { StashAttachmentMeasure } from '../../drafts/native-chat-prompt-stash-store'
import { stashAttachmentName } from '../../drafts/native-chat-prompt-stash-attachment-fit'
import type { JSONContent } from '@tiptap/react'
import { chatImageAccess } from '@/lib/files/access/local-file-access'
import { isBrowserAttachmentToken } from '@/lib/files/drop/browser-attachment-files'
import { nativeChatPastedTextToken } from '../../paste/native-chat-pasted-text-reference'

/** Real on-disk size, so the entry budget constrains attachment payload rather than path length. */
export const measureStashAttachment: StashAttachmentMeasure = async (image) => {
  const stat = window.api?.fs?.stat
  if (!stat || !image.path || isBrowserAttachmentToken(image.path)) {
    return 0
  }
  try {
    const result = await stat({
      filePath: image.path,
      ...(image.connectionId ? { connectionId: image.connectionId } : {}),
      access: chatImageAccess()
    })
    return result.isDirectory ? 0 : result.size
  } catch {
    return 0
  }
}

/** A restored draft joins whatever the user already typed: text after a blank line, images merged. */
export function mergeRestoredDraft(
  current: { text: string; document?: JSONContent },
  restored: { text: string; document?: JSONContent }
): { text: string; document: JSONContent } {
  const merged = withIndependentNativeChatComposerDraft({ ...current, images: [] }, { ...restored })
  return { text: merged.text, document: merged.document ?? promptTextContent(merged.text) }
}

/** Which of these attachments no longer exist where the entry names them. */
export async function missingPaths(
  images: readonly NativeChatComposerDraftImage[]
): Promise<Set<string>> {
  const paths = images.filter((image) => !isBrowserAttachmentToken(image.path))
  const missing = await findMissingNativeChatComposerDraftImages(paths)
  // Browser file tokens have no durable path once the source draft releases them.
  for (const image of images) {
    if (isBrowserAttachmentToken(image.path)) {
      missing.add(image.id)
    }
  }
  return missing
}

/** A missing image becomes a named "attach again" placeholder, keeping its file name visible. */
export function degradeMissingImages(
  images: readonly NativeChatComposerDraftImage[],
  missing: ReadonlySet<string>
): NativeChatComposerDraftImage[] {
  return images.map((image) =>
    missing.has(image.id) && image.unavailableName === undefined
      ? { id: image.id, path: '', unavailableName: basename(image.path) }
      : image
  )
}

/**
 * The archived draft. A paste already gone at stash time keeps its token in the text and becomes a
 * named "attach again" placeholder, so restore never sends a dead path and never loses the name.
 */
export async function stashableDraft(
  current: NativeChatComposerDraft
): Promise<StoredNativeChatStashDraft> {
  const missing = await missingPaths(
    Object.entries(current.pastedTextFiles ?? {}).map(([id, path]) => ({ id, path }))
  )
  const pastedTextFiles: Record<string, string> = {}
  const pastedTextUnavailable: Record<string, string> = { ...current.pastedTextUnavailable }
  for (const [id, path] of Object.entries(current.pastedTextFiles ?? {})) {
    if (missing.has(id)) {
      pastedTextUnavailable[id] = stashAttachmentName(path)
    } else {
      pastedTextFiles[id] = path
    }
  }
  return {
    text: current.text.trimEnd(),
    ...(current.document ? { document: current.document } : {}),
    ...(Object.keys(pastedTextFiles).length ? { pastedTextFiles } : {}),
    ...(Object.keys(pastedTextUnavailable).length ? { pastedTextUnavailable } : {}),
    images: current.images
  }
}

/**
 * Clear only what the stash archived. When the body changed while the write landed, keep every paste
 * the current text still references (its token is still in the composer) plus any paste the user
 * added; only the archived pastes the draft no longer names are dropped.
 */
export function clearStashedDraft(draftScopeKey: string, archived: NativeChatComposerDraft): void {
  const latest = readNativeChatComposerDraft(draftScopeKey)
  const bodyUntouched =
    latest.text === archived.text &&
    sameNativeChatComposerDraftDocument(latest.document, archived.document)
  const addedDuringWrite =
    latest.images.length !== archived.images.length ||
    latest.images.some((image, index) => image.id !== archived.images[index]?.id)
  if (bodyUntouched && !addedDuringWrite) {
    updateNativeChatComposerDraft(
      draftScopeKey,
      { text: '', images: [], document: undefined, pastedTextFiles: {}, pastedTextUnavailable: {} },
      'immediate'
    )
    return
  }
  // Keep what the user added while the write landed; only the archived images go.
  const archivedIds = new Set(archived.images.map((image) => image.id))
  // Why keep referenced pastes: the text still shows their tokens, so dropping the path would turn a
  // live attachment into an "unsaved" pill. Only an archived paste the draft no longer names goes.
  const pastedTextFiles = Object.fromEntries(
    Object.entries(latest.pastedTextFiles ?? {}).filter(([id]) =>
      latest.text.includes(nativeChatPastedTextToken(id))
    )
  )
  const pastedTextUnavailable = Object.fromEntries(
    Object.entries(latest.pastedTextUnavailable ?? {}).filter(([id]) =>
      latest.text.includes(nativeChatPastedTextToken(id))
    )
  )
  updateNativeChatComposerDraft(
    draftScopeKey,
    {
      images: latest.images.filter((image) => !archivedIds.has(image.id)),
      pastedTextFiles,
      pastedTextUnavailable
    },
    'immediate'
  )
}
