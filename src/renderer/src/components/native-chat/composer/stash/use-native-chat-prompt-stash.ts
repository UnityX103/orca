// The composer's stash: archive the draft, restore entries, and the pulse the badge replays.

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store/index'
import { createNonSecureContextUuid } from '../../../../../../shared/identifiers/non-secure-context-uuid'
import { isBrowserAttachmentToken } from '@/lib/files/drop/browser-attachment-files'
import { isAgentSessionAttachmentStorePath } from '../../../../../../shared/agent-session/agent-session-attachments'
import {
  stageNativeChatDraftFile,
  leaseNativeChatStagedFiles
} from '../../drafts/native-chat-draft-attachment-staging'
import { nativeChatPendingAttachmentSnapshot } from '../../attachments/chips/native-chat-pending-attachment-cache'
import {
  clearStashedDraft,
  degradeMissingImages,
  measureStashAttachment,
  mergeRestoredDraft,
  missingPaths,
  stashableDraft
} from './native-chat-stash-draft-helpers'
import { stashAttachmentName } from '../../drafts/native-chat-prompt-stash-attachment-fit'
import {
  readNativeChatComposerDraft,
  updateNativeChatComposerDraft,
  isNativeChatComposerDraftUnsaved
} from '../../drafts/native-chat-composer-draft-store'
import { nativeChatComposerDraftWriteSettled } from '../../drafts/native-chat-composer-draft-persistence'
import { resolveNativeChatStashScope } from '../../drafts/native-chat-stash-owner'
import {
  NO_STASH_ENTRIES,
  deleteNativeChatStashEntry,
  readNativeChatStashEntries,
  stashNativeChatDraft,
  subscribeToNativeChatStash
} from '../../drafts/native-chat-prompt-stash-store'
import { claimNativeChatStashEntry } from '../../drafts/native-chat-prompt-stash-claim'
import {
  MAX_NATIVE_CHAT_STASH_ENTRIES,
  type NativeChatStashScope,
  type StoredNativeChatStashEntry
} from '../../drafts/native-chat-prompt-stash-storage'

export type NativeChatPromptStash = {
  readonly scope: NativeChatStashScope | null
  readonly entries: readonly StoredNativeChatStashEntry[]
  /** Bumped per stash; the badge replays its one-shot pulse per key. */
  readonly pulseKey: number
  readonly isOpen: boolean
  setOpen: (open: boolean) => void
  /** The shortcut: archive a non-empty draft, else restore the only entry or open the list. */
  stashOrRestore: () => void
  restore: (entry: StoredNativeChatStashEntry) => Promise<void>
  remove: (entry: StoredNativeChatStashEntry) => Promise<void>
}

export function useNativeChatPromptStash(args: {
  draftScopeKey: string
  draft: string
  fallbackWorkspaceId?: string
  disabled: boolean
  /** A long paste is still being saved; stashing would strand it in the emptied composer. */
  pastedTextSaving: boolean
  focusComposer: () => void
}): NativeChatPromptStash | null {
  const { draftScopeKey, draft, fallbackWorkspaceId, disabled, pastedTextSaving, focusComposer } =
    args
  const t = useTranslate()
  const [isOpen, setOpen] = useState(false)
  const [pulseKey, setPulseKey] = useState(0)
  // One stash/restore at a time: a held chord or double click must not archive twice.
  const busy = useRef(false)
  const workspaceId = useAppStore((s) => s.activeWorktreeId)
  const scope = useMemo(
    () =>
      resolveNativeChatStashScope(
        useAppStore.getState(),
        draftScopeKey,
        fallbackWorkspaceId ?? workspaceId ?? undefined
      ),
    [draftScopeKey, fallbackWorkspaceId, workspaceId]
  )
  const subscribe = useCallback(
    (listener: () => void) => (scope ? subscribeToNativeChatStash(scope, listener) : () => {}),
    [scope]
  )
  const entries = useSyncExternalStore(subscribe, () =>
    scope ? readNativeChatStashEntries(scope) : NO_STASH_ENTRIES
  )

  const notice = useCallback((text: string) => {
    toast.info(text)
  }, [])

  const stash = useCallback(async (): Promise<boolean> => {
    if (!scope || busy.current) {
      return false
    }
    if (pastedTextSaving) {
      notice(
        t(
          'components.native-chat.stash.pasteStillSaving',
          'Still saving a paste. Stash again once it finishes.'
        )
      )
      return false
    }
    if (nativeChatPendingAttachmentSnapshot(draftScopeKey).length > 0) {
      notice(
        t(
          'components.native-chat.stash.attachmentStillSaving',
          'Still adding an attachment. Stash again once it finishes.'
        )
      )
      return false
    }
    const current = readNativeChatComposerDraft(draftScopeKey)
    if (current.text.trim() === '' && current.images.length === 0) {
      return false
    }
    busy.current = true
    let releaseLease: (() => void) | null = null
    try {
      // Lease the archived files so clearing the draft below cannot release them mid-write.
      const leasedPaths = [
        ...current.images.map((image) => image.path),
        ...Object.values(current.pastedTextFiles ?? {})
      ].filter((path) => path && !isBrowserAttachmentToken(path))
      releaseLease = leaseNativeChatStagedFiles(draftScopeKey, leasedPaths)
      const result = await stashNativeChatDraft(
        scope,
        await stashableDraft(current),
        Date.now(),
        createNonSecureContextUuid(),
        measureStashAttachment
      )
      if (!result.ok) {
        notice(
          result.reason === 'full'
            ? t(
                'components.native-chat.stash.full',
                'Stash holds {{max}} prompts. Restore or delete one to make room; your input is kept.',
                { max: MAX_NATIVE_CHAT_STASH_ENTRIES }
              )
            : result.reason === 'unavailable'
              ? t(
                  'components.native-chat.stash.unavailable',
                  "Saved prompts couldn't be loaded, so nothing was stashed. Your input was kept."
                )
              : t(
                  'components.native-chat.stash.saveFailed',
                  "Couldn't stash this prompt. Your input was kept."
                )
        )
        return false
      }
      clearStashedDraft(draftScopeKey, current)
      setPulseKey((key) => key + 1)
      focusComposer()
      return true
    } finally {
      // A failed or thrown stash must still drop the lease, or the draft's files stay pinned forever.
      releaseLease?.()
      busy.current = false
    }
  }, [draftScopeKey, focusComposer, notice, pastedTextSaving, scope, t])

  const restore = useCallback(
    async (requested: StoredNativeChatStashEntry) => {
      if (!scope || busy.current) {
        return
      }
      // Claim the entry for this scope before any await: two composers restoring the same entry
      // (each with its own `busy` ref) must not both read and merge it.
      const claim = claimNativeChatStashEntry(scope, requested.id)
      if (!claim) {
        return
      }
      busy.current = true
      setOpen(false)
      try {
        // Use the latest stored copy, not the possibly-stale row the caller rendered.
        const entry = claim.entry
        const images = entry.draft.images
        const pastes = Object.entries(entry.draft.pastedTextFiles ?? {})
        const [missingImages, missingPastes] = await Promise.all([
          missingPaths(images),
          missingPaths(pastes.map(([id, path]) => ({ id, path })))
        ])
        const restoredImages = degradeMissingImages(images, missingImages)
        // A dead paste keeps its token and gains a named placeholder: the pill shows its file name,
        // Send is held, and the dead path is never handed to the agent.
        const pastedTextFiles: Record<string, string> = {}
        const pastedTextUnavailable: Record<string, string> = {
          ...entry.draft.pastedTextUnavailable
        }
        for (const [id, path] of pastes) {
          if (missingPastes.has(id)) {
            pastedTextUnavailable[id] = stashAttachmentName(path)
          } else if (path) {
            pastedTextFiles[id] = path
          }
        }
        // Re-stage only files this client must upload. A remote attachment already lives where the
        // agent reads it, and staging it would retry an upload from a path this client cannot read.
        for (const image of restoredImages) {
          if (image.path && !image.connectionId && !isAgentSessionAttachmentStorePath(image.path)) {
            stageNativeChatDraftFile(draftScopeKey, image.path)
          }
        }
        for (const path of Object.values(pastedTextFiles)) {
          if (path && !isBrowserAttachmentToken(path) && !isAgentSessionAttachmentStorePath(path)) {
            stageNativeChatDraftFile(draftScopeKey, path)
          }
        }
        const current = readNativeChatComposerDraft(draftScopeKey)
        const merged = mergeRestoredDraft(current, entry.draft)
        const held = new Set(current.images.map((image) => image.id))
        updateNativeChatComposerDraft(
          draftScopeKey,
          {
            text: merged.text,
            document: merged.document,
            pastedTextFiles: { ...current.pastedTextFiles, ...pastedTextFiles },
            pastedTextUnavailable: { ...current.pastedTextUnavailable, ...pastedTextUnavailable },
            images: [...current.images, ...restoredImages.filter((image) => !held.has(image.id))]
          },
          'immediate'
        )
        // The entry leaves only after the merged draft is durably saved, so a refused write keeps it.
        const settled = await nativeChatComposerDraftWriteSettled(draftScopeKey)
        if (!settled || isNativeChatComposerDraftUnsaved(draftScopeKey)) {
          notice(
            t(
              'components.native-chat.stash.restoreNotSaved',
              'Restored into the composer, but it could not be saved. The stash entry is kept.'
            )
          )
          return
        }
        const removed = await deleteNativeChatStashEntry(scope, entry.id)
        if (!removed) {
          notice(
            t(
              'components.native-chat.stash.restoreNotRemoved',
              'Restored into the composer, but the stash entry could not be removed.'
            )
          )
        }
        if (missingImages.size + missingPastes.size > 0) {
          notice(
            t(
              'components.native-chat.stash.restoreMissingAttachments',
              'Some attachments could not be restored. Attach them again to send.'
            )
          )
        }
        focusComposer()
      } finally {
        claim.release()
        busy.current = false
      }
    },
    [draftScopeKey, focusComposer, notice, scope, t]
  )

  const remove = useCallback(
    async (entry: StoredNativeChatStashEntry) => {
      if (!scope || busy.current) {
        return
      }
      const removed = await deleteNativeChatStashEntry(scope, entry.id)
      if (!removed) {
        notice(
          t('components.native-chat.stash.deleteFailed', "Couldn't delete this stashed prompt.")
        )
      }
    },
    [notice, scope, t]
  )

  const stashOrRestore = useCallback(() => {
    if (disabled || !scope || busy.current) {
      return
    }
    const hasContent =
      draft.trim() !== '' || readNativeChatComposerDraft(draftScopeKey).images.length > 0
    if (hasContent) {
      void stash()
      return
    }
    if (entries.length === 1) {
      void restore(entries[0])
      return
    }
    if (entries.length === 0) {
      // Nothing to restore, and the composer is empty: say so rather than opening an empty list.
      notice(t('components.native-chat.stash.empty', 'Nothing stashed yet.'))
      return
    }
    setOpen(true)
  }, [disabled, draft, draftScopeKey, entries, notice, restore, scope, stash, t])

  if (!scope) {
    return null
  }
  return {
    scope,
    entries,
    pulseKey,
    isOpen,
    setOpen,
    stashOrRestore,
    restore,
    remove
  }
}
