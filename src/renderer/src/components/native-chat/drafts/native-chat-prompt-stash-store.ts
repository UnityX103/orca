// The prompt stash: archived drafts per workspace, newest first, written before the composer clears.

import {
  MAX_NATIVE_CHAT_STASH_ENTRIES,
  MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS,
  nativeChatStashScopeKey,
  nativeChatStashStorage,
  parseStoredNativeChatStashList,
  type NativeChatStashScope,
  type StoredNativeChatStashDraft,
  type StoredNativeChatStashEntry,
  type StoredNativeChatStashList
} from './native-chat-prompt-stash-storage'
import type { NativeChatComposerDraftImage } from './native-chat-composer-draft-storage'

type StashRecord = NativeChatStashScope & { entries: StoredNativeChatStashEntry[] }

const records = new Map<string, StashRecord>()
const listeners = new Map<string, Set<() => void>>()
const refusedScopes = new Set<string>()
// One write path per scope: actions run in order, so rapid stashes cannot overwrite each other.
const queues = new Map<string, Promise<unknown>>()
export const NO_STASH_ENTRIES: readonly StoredNativeChatStashEntry[] = Object.freeze([])

let hydration: Promise<void> | null = null
let hydrated = false

function notify(scopeKey: string): void {
  listeners.get(scopeKey)?.forEach((listener) => listener())
}

function recordOf(scope: NativeChatStashScope): StashRecord {
  const key = nativeChatStashScopeKey(scope)
  let record = records.get(key)
  if (!record) {
    record = { ...scope, entries: [] }
    records.set(key, record)
  }
  return record
}

function enqueue<T>(scopeKey: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(scopeKey) ?? Promise.resolve()
  const next = previous.then(action, action)
  queues.set(
    scopeKey,
    next.catch(() => undefined)
  )
  return next
}

export function subscribeToNativeChatStash(
  scope: NativeChatStashScope,
  listener: () => void
): () => void {
  const key = nativeChatStashScopeKey(scope)
  const set = listeners.get(key) ?? new Set()
  listeners.set(key, set)
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) {
      listeners.delete(key)
    }
  }
}

export function readNativeChatStashEntries(
  scope: NativeChatStashScope
): readonly StoredNativeChatStashEntry[] {
  return records.get(nativeChatStashScopeKey(scope))?.entries ?? NO_STASH_ENTRIES
}

export function isNativeChatStashRefused(scope: NativeChatStashScope): boolean {
  return refusedScopes.has(nativeChatStashScopeKey(scope))
}

/** Attachments keep their file names but lose their references once the entry's payload is over budget. */
function fitStashDraft(draft: StoredNativeChatStashDraft): {
  draft: StoredNativeChatStashDraft
  droppedAttachmentNames: readonly string[]
} {
  const documentChars = draft.document ? JSON.stringify(draft.document).length : 0
  const pastedChars = draft.pastedTextFiles ? JSON.stringify(draft.pastedTextFiles).length : 0
  let used = draft.text.length + documentChars + pastedChars
  const droppedAttachmentNames: string[] = []
  const images: NativeChatComposerDraftImage[] = []
  for (const image of draft.images) {
    const size = JSON.stringify([image.id, image.path, image.connectionId ?? '']).length
    const fits = used + size <= MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS
    if (image.unavailableName !== undefined || fits) {
      images.push(image)
      used += size
      continue
    }
    const name = image.path.split(/[\\/]/).findLast(Boolean) ?? image.path
    droppedAttachmentNames.push(name)
    images.push({ id: image.id, path: '', unavailableName: name })
  }
  return {
    draft: { ...draft, images },
    droppedAttachmentNames
  }
}

async function writeList(scope: NativeChatStashScope, entries: readonly StoredNativeChatStashEntry[]) {
  const key = nativeChatStashScopeKey(scope)
  const list: StoredNativeChatStashList = { ...scope, entries: [...entries] }
  try {
    await nativeChatStashStorage().write(key, list)
    refusedScopes.delete(key)
  } catch (error) {
    refusedScopes.add(key)
    notify(key)
    throw error
  }
}

export type StashDraftResult =
  | { ok: true }
  | { ok: false; reason: 'full' | 'refused' }

/** Archive a draft; only a committed write lets the caller clear the composer. */
export async function stashNativeChatDraft(
  scope: NativeChatStashScope,
  draft: StoredNativeChatStashDraft,
  createdAt = Date.now(),
  id: string
): Promise<StashDraftResult> {
  const { draft: fitted, droppedAttachmentNames } = fitStashDraft(draft)
  return enqueue(nativeChatStashScopeKey(scope), async (): Promise<StashDraftResult> => {
    const record = recordOf(scope)
    if (record.entries.length >= MAX_NATIVE_CHAT_STASH_ENTRIES) {
      return { ok: false, reason: 'full' }
    }
    const entry: StoredNativeChatStashEntry = {
      id,
      createdAt,
      draft: fitted,
      ...(droppedAttachmentNames.length ? { droppedAttachmentNames } : {})
    }
    const next = [entry, ...record.entries]
    try {
      await writeList(scope, next)
    } catch {
      return { ok: false, reason: 'refused' }
    }
    record.entries = next
    notify(nativeChatStashScopeKey(scope))
    return { ok: true }
  })
}

/** Remove the entry first; the caller merges the returned draft into whatever the composer holds. */
export async function takeNativeChatStashEntry(
  scope: NativeChatStashScope,
  entryId: string
): Promise<StoredNativeChatStashEntry | null> {
  return enqueue(nativeChatStashScopeKey(scope), async () => {
    const record = recordOf(scope)
    const entry = record.entries.find((candidate) => candidate.id === entryId)
    if (!entry) {
      return null
    }
    const next = record.entries.filter((candidate) => candidate.id !== entryId)
    try {
      await writeList(scope, next)
    } catch {
      return null
    }
    record.entries = next
    notify(nativeChatStashScopeKey(scope))
    return entry
  })
}

export async function deleteNativeChatStashEntry(
  scope: NativeChatStashScope,
  entryId: string
): Promise<boolean> {
  return (await takeNativeChatStashEntry(scope, entryId)) !== null
}

function applyLoaded(loaded: ReadonlyMap<string, unknown>): void {
  for (const [key, value] of loaded) {
    const list = parseStoredNativeChatStashList(key, value)
    if (!list) {
      continue
    }
    records.set(key, {
      workspaceId: list.workspaceId,
      executionHostId: list.executionHostId,
      entries: [...list.entries]
    })
  }
  hydrated = true
  for (const key of listeners.keys()) {
    notify(key)
  }
}

/** Loads every workspace's stash once; a failed load is retried by the next call. */
export function hydrateNativeChatPromptStash(): Promise<void> {
  hydration ??= nativeChatStashStorage()
    .loadAll()
    .then(applyLoaded)
    .catch(() => {
      hydration = null
    })
  return hydration
}

export function isNativeChatPromptStashHydrated(): boolean {
  return hydrated
}

/** Workspace removal clears its stash; a missing host matches every host's same-id workspace. */
export async function deleteNativeChatStashesOwnedBy(scope: {
  workspaceId: string
  executionHostId?: NativeChatStashScope['executionHostId']
}): Promise<void> {
  const keys: string[] = []
  for (const [key, record] of records) {
    if (
      record.workspaceId === scope.workspaceId &&
      (scope.executionHostId === undefined || record.executionHostId === scope.executionHostId)
    ) {
      keys.push(key)
    }
  }
  // Why storage too: a scope never loaded here still lives in IndexedDB.
  const storage = nativeChatStashStorage()
  const loaded = await storage.loadAll().catch(() => new Map<string, unknown>())
  const removable = new Set(keys)
  for (const key of loaded.keys()) {
    const record = records.get(key)
    if (record) {
      continue
    }
    const parsed = parseStoredNativeChatStashList(key, loaded.get(key))
    if (
      parsed &&
      parsed.workspaceId === scope.workspaceId &&
      (scope.executionHostId === undefined || parsed.executionHostId === scope.executionHostId)
    ) {
      removable.add(key)
    }
  }
  if (removable.size === 0) {
    return
  }
  try {
    await storage.remove([...removable])
  } catch {
    return
  }
  for (const key of removable) {
    const record = records.get(key)
    records.delete(key)
    refusedScopes.delete(key)
    if (record) {
      notify(key)
    }
  }
}

export function clearNativeChatPromptStashForTests(): void {
  records.clear()
  listeners.clear()
  refusedScopes.clear()
  queues.clear()
  hydration = null
  hydrated = false
}
