// The prompt stash: archived drafts per workspace, newest first, written before the composer clears.

import {
  MAX_NATIVE_CHAT_STASH_ENTRIES,
  nativeChatStashScopeKey,
  nativeChatStashScopeOfKey,
  nativeChatStashStorage,
  parseStoredNativeChatStashList,
  type NativeChatStashScope,
  type StoredNativeChatStashDraft,
  type StoredNativeChatStashEntry,
  type StoredNativeChatStashList
} from './native-chat-prompt-stash-storage'
import {
  fitStashDraft,
  type StashAttachmentMeasure
} from './native-chat-prompt-stash-attachment-fit'

export { fitStashDraft, type StashAttachmentMeasure }

type StashRecord = NativeChatStashScope & { entries: StoredNativeChatStashEntry[] }

const records = new Map<string, StashRecord>()
const listeners = new Map<string, Set<() => void>>()
// Any-scope listeners, for a count that spans a workspace's hosts before hydration names them.
const anyListeners = new Set<() => void>()
// Removed scopes: a write for any of them (queued or new) must not resurrect the stash.
const removedScopes = new Set<string>()

const refusedScopes = new Set<string>()
// One write path per scope: actions run in order, so rapid stashes cannot overwrite each other.
const queues = new Map<string, Promise<unknown>>()
export const NO_STASH_ENTRIES: readonly StoredNativeChatStashEntry[] = Object.freeze([])

// Why distinct from `loaded`: a failed load must keep writes off, since an empty memory list would
// overwrite records still in IndexedDB.
type LoadState = 'idle' | 'loading' | 'loaded' | 'failed'
let loadState: LoadState = 'idle'
let hydration: Promise<boolean> | null = null

function notify(scopeKey: string): void {
  listeners.get(scopeKey)?.forEach((listener) => listener())
  anyListeners.forEach((listener) => listener())
}

/** Fires on any scope's change; the removal notice counts across every host a workspace uses. */
export function subscribeToAnyNativeChatStash(listener: () => void): () => void {
  anyListeners.add(listener)
  return () => {
    anyListeners.delete(listener)
  }
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

/** Await this scope's earlier writes, then its load; a blocked result means no write ran. */
type QueuedResult<T> = { value: T } | { blocked: 'unavailable' | 'removed' }

function enqueue<T>(scopeKey: string, action: () => Promise<T>): Promise<QueuedResult<T>> {
  const previous = queues.get(scopeKey) ?? Promise.resolve()
  const next = previous.then(async (): Promise<QueuedResult<T>> => {
    if (!(await hydrateNativeChatPromptStash())) {
      // Refuse rather than write an empty list over records the failed load never read.
      return { blocked: 'unavailable' }
    }
    // Re-checked after the await: a removal may have begun or committed while this queued.
    if (removedScopes.has(scopeKey)) {
      return { blocked: 'removed' }
    }
    return { value: await action() }
  })
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

/** How many stashed prompts a removal would clear for a workspace, across its hosts when unnamed. */
export function countNativeChatStashEntriesOwnedBy(scope: {
  workspaceId: string
  executionHostId?: NativeChatStashScope['executionHostId']
}): number {
  let count = 0
  for (const record of records.values()) {
    if (
      record.workspaceId === scope.workspaceId &&
      (scope.executionHostId === undefined || record.executionHostId === scope.executionHostId)
    ) {
      count += record.entries.length
    }
  }
  return count
}

async function writeList(
  scope: NativeChatStashScope,
  entries: readonly StoredNativeChatStashEntry[]
) {
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

export type StashDraftFailure = 'full' | 'refused' | 'unavailable' | 'removed'
export type StashDraftResult = { ok: true } | { ok: false; reason: StashDraftFailure }

/** Archive a draft; only a committed write lets the caller clear the composer. */
export async function stashNativeChatDraft(
  scope: NativeChatStashScope,
  draft: StoredNativeChatStashDraft,
  createdAt = Date.now(),
  id: string,
  measure: StashAttachmentMeasure = async () => 0
): Promise<StashDraftResult> {
  const { draft: fitted, droppedAttachmentNames } = await fitStashDraft(draft, measure)
  const result = await enqueue(
    nativeChatStashScopeKey(scope),
    async (): Promise<StashDraftResult> => {
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
    }
  )
  return 'blocked' in result ? { ok: false, reason: result.blocked } : result.value
}

/** Remove the entry first; the caller merges the returned draft into whatever the composer holds. */
export async function takeNativeChatStashEntry(
  scope: NativeChatStashScope,
  entryId: string
): Promise<StoredNativeChatStashEntry | null> {
  const result = await enqueue(nativeChatStashScopeKey(scope), async () => {
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
  return 'blocked' in result ? null : result.value
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
  loadState = 'loaded'
  for (const key of listeners.keys()) {
    notify(key)
  }
}

/** Resolves true once every saved stash is in memory, false when the load failed (a later call retries). */
export function hydrateNativeChatPromptStash(): Promise<boolean> {
  if (loadState === 'loaded') {
    return Promise.resolve(true)
  }
  hydration ??= nativeChatStashStorage()
    .loadAll()
    .then((loaded) => {
      applyLoaded(loaded)
      return true
    })
    .catch((error: unknown) => {
      console.warn('[native-chat-stash] saved prompts could not be loaded; writes are held', error)
      loadState = 'failed'
      hydration = null
      return false
    })
  return hydration
}

export function isNativeChatPromptStashHydrated(): boolean {
  return loadState === 'loaded'
}

export function isNativeChatPromptStashLoadFailed(): boolean {
  return loadState === 'failed'
}

/** Matches a stash record/scope to a workspace, across hosts when no host is named. */
function ownedByMatches(
  scope: { workspaceId: string; executionHostId?: NativeChatStashScope['executionHostId'] },
  value: { workspaceId: string; executionHostId: string }
): boolean {
  return (
    value.workspaceId === scope.workspaceId &&
    (scope.executionHostId === undefined || value.executionHostId === scope.executionHostId)
  )
}

/** Tombstone a workspace's scope keys synchronously when its removal begins (idempotent). */
export async function tombstoneNativeChatStashesOwnedBy(scope: {
  workspaceId: string
  executionHostId?: NativeChatStashScope['executionHostId']
}): Promise<void> {
  if (scope.executionHostId) {
    removedScopes.add(nativeChatStashScopeKey({ ...scope, executionHostId: scope.executionHostId }))
  }
  for (const [key, record] of records) {
    if (ownedByMatches(scope, record)) {
      removedScopes.add(key)
    }
  }
  for (const key of queues.keys()) {
    const queued = nativeChatStashScopeOfKey(key)
    if (queued && ownedByMatches(scope, queued)) {
      removedScopes.add(key)
    }
  }
}

/** Clear a removed workspace's stash; tombstones every key before any await, then sweeps storage. */
export async function deleteNativeChatStashesOwnedBy(scope: {
  workspaceId: string
  executionHostId?: NativeChatStashScope['executionHostId']
}): Promise<void> {
  await tombstoneNativeChatStashesOwnedBy(scope)
  const removable = new Set<string>()
  for (const [key, record] of records) {
    if (ownedByMatches(scope, record)) {
      removable.add(key)
    }
  }
  const loaded = await nativeChatStashStorage()
    .loadAll()
    .catch(() => new Map<string, unknown>())
  for (const [key, value] of loaded) {
    const parsed = parseStoredNativeChatStashList(key, value)
    if (parsed && ownedByMatches(scope, parsed)) {
      removable.add(key)
    }
  }
  if (removable.size === 0) {
    return
  }
  await Promise.all([...removable].flatMap((key) => queues.get(key) ?? []))
  try {
    await nativeChatStashStorage().remove([...removable])
    for (const key of removable) {
      records.delete(key)
      refusedScopes.delete(key)
      notify(key)
    }
  } catch {
    // The host kept its records; the tombstone stays so the workspace's stash is not recreated now.
  }
}

export function clearNativeChatPromptStashForTests(): void {
  records.clear()
  listeners.clear()
  anyListeners.clear()
  removedScopes.clear()
  refusedScopes.clear()
  queues.clear()
  hydration = null
  loadState = 'idle'
}
