// Stashed prompts are archived drafts: they outlive the composer but stay per workspace.

import type { JSONContent } from '@tiptap/react'
import {
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../../shared/execution-host/execution-host'
import {
  committedTransaction,
  indexedDbConnection,
  settledRequest
} from '@/app-shell/storage/indexeddb-connection'
import type { NativeChatComposerDraftImage } from './native-chat-composer-draft-storage'

// Mirrors T3 Code's sanity bound: the user removes entries; storage never does.
export const MAX_NATIVE_CHAT_STASH_ENTRIES = 100
// T3 Code caps an entry's compressed image dataURLs at 2,700,000 chars (MAX_STASH_ENTRY_ATTACHMENT_CHARS).
// Orca keeps attachment file references instead of base64, so the equivalent budget is the serialized
// attachment payload (image paths + pasted-text map + rich document); past it, references degrade to
// "attach again" placeholders rather than bloating one entry.
export const MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS = 2_700_000

const DATABASE_NAME = 'orca-native-chat-prompt-stash'
const DATABASE_VERSION = 1
const STASHES = 'stashes'

/** The workspace whose chats share this stash; removal of the workspace clears it. */
export type NativeChatStashScope = {
  readonly workspaceId: string
  readonly executionHostId: ExecutionHostId
}

export type StoredNativeChatStashDraft = {
  readonly text: string
  readonly document?: JSONContent
  readonly pastedTextFiles?: Readonly<Record<string, string>>
  readonly images: readonly NativeChatComposerDraftImage[]
}

export type StoredNativeChatStashEntry = {
  readonly id: string
  readonly createdAt: number
  readonly draft: StoredNativeChatStashDraft
  /** Attachments left as "attach again" placeholders when this entry was archived. */
  readonly droppedAttachmentNames?: readonly string[]
}

export type StoredNativeChatStashList = NativeChatStashScope & {
  /** Newest first. */
  readonly entries: readonly StoredNativeChatStashEntry[]
}

/** `${executionHostId}\n${workspaceId}`: stable per host so another host's same-id workspace never shares. */
export function nativeChatStashScopeKey(scope: NativeChatStashScope): string {
  return `${scope.executionHostId}\n${scope.workspaceId}`
}

export function nativeChatStashScopeOfKey(key: string): NativeChatStashScope | null {
  const separator = key.indexOf('\n')
  if (separator === -1) {
    return null
  }
  const host = parseExecutionHostId(key.slice(0, separator))
  const workspaceId = key.slice(separator + 1)
  return host && workspaceId ? { workspaceId, executionHostId: host.id } : null
}

export type NativeChatStashStorage = {
  loadAll(): Promise<ReadonlyMap<string, unknown>>
  write(scopeKey: string, list: StoredNativeChatStashList): Promise<void>
  remove(scopeKeys: readonly string[]): Promise<void>
}

export function createIndexedDbNativeChatStashStorage(
  factory: IDBFactory
): NativeChatStashStorage {
  const database = indexedDbConnection(factory, DATABASE_NAME, DATABASE_VERSION, (db) => {
    if (!db.objectStoreNames.contains(STASHES)) {
      db.createObjectStore(STASHES)
    }
  })

  const change = async (apply: (stashes: IDBObjectStore) => void): Promise<void> => {
    const transaction = (await database()).transaction(STASHES, 'readwrite')
    const done = committedTransaction(transaction)
    apply(transaction.objectStore(STASHES))
    // Why: commit now rather than when the task ends, so a quit right after still lands it.
    transaction.commit?.()
    await done
  }

  return {
    loadAll: async () => {
      const stashes = (await database()).transaction(STASHES, 'readonly').objectStore(STASHES)
      const [keys, values] = await Promise.all([
        settledRequest(stashes.getAllKeys()),
        settledRequest(stashes.getAll())
      ])
      const loaded = new Map<string, unknown>()
      if (Array.isArray(keys) && Array.isArray(values)) {
        keys.forEach((key, index) => {
          if (typeof key === 'string') {
            loaded.set(key, values[index])
          }
        })
      }
      return loaded
    },
    write: (scopeKey, list) => change((stashes) => stashes.put(list, scopeKey)),
    remove: (scopeKeys) =>
      change((stashes) => {
        for (const scopeKey of scopeKeys) {
          stashes.delete(scopeKey)
        }
      })
  }
}

/** Run-local storage without IndexedDB, and the controllable test backend. */
export function createMemoryNativeChatStashStorage(): NativeChatStashStorage & {
  readonly stashes: Map<string, StoredNativeChatStashList>
  refuseWrites: boolean
} {
  const stashes = new Map<string, StoredNativeChatStashList>()
  const storage = {
    stashes,
    refuseWrites: false,
    loadAll: async () => new Map(stashes),
    write: (scopeKey: string, list: StoredNativeChatStashList) => {
      if (storage.refuseWrites) {
        return Promise.reject(new DOMException('refused', 'QuotaExceededError'))
      }
      stashes.set(scopeKey, list)
      return Promise.resolve()
    },
    remove: (scopeKeys: readonly string[]) => {
      for (const scopeKey of scopeKeys) {
        stashes.delete(scopeKey)
      }
      return Promise.resolve()
    }
  }
  return storage
}

let storage: NativeChatStashStorage | null = null

export function nativeChatStashStorage(): NativeChatStashStorage {
  storage ??=
    typeof indexedDB === 'undefined'
      ? createMemoryNativeChatStashStorage()
      : createIndexedDbNativeChatStashStorage(indexedDB)
  return storage
}

export function setNativeChatStashStorageForTests(next: NativeChatStashStorage | null): void {
  storage = next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEditorDocument(value: unknown): value is JSONContent {
  return isRecord(value) && value.type === 'doc'
}

function parseImage(value: unknown): NativeChatComposerDraftImage | null {
  if (!isRecord(value)) {
    return null
  }
  const { id, path, connectionId, unavailableName } = value
  if (typeof id !== 'string') {
    return null
  }
  if (typeof unavailableName === 'string') {
    return { id, path: '', unavailableName }
  }
  if (typeof path !== 'string' || path === '') {
    return null
  }
  return { id, path, ...(typeof connectionId === 'string' ? { connectionId } : {}) }
}

function parseEntry(value: unknown): StoredNativeChatStashEntry | null {
  if (!isRecord(value)) {
    return null
  }
  const { id, createdAt, draft, droppedAttachmentNames } = value
  if (typeof id !== 'string' || typeof createdAt !== 'number' || !isRecord(draft)) {
    return null
  }
  const { text, images, document, pastedTextFiles } = draft
  if (typeof text !== 'string' || !Array.isArray(images)) {
    return null
  }
  const pasted = isRecord(pastedTextFiles)
    ? Object.fromEntries(
        Object.entries(pastedTextFiles).flatMap(([key, path]): [string, string][] =>
          typeof path === 'string' && path !== '' ? [[key, path]] : []
        )
      )
    : undefined
  return {
    id,
    createdAt,
    draft: {
      text,
      ...(pasted ? { pastedTextFiles: pasted } : {}),
      ...(isEditorDocument(document) ? { document } : {}),
      images: images.flatMap((image) => parseImage(image) ?? [])
    },
    ...(Array.isArray(droppedAttachmentNames)
      ? {
          droppedAttachmentNames: droppedAttachmentNames.filter(
            (name): name is string => typeof name === 'string'
          )
        }
      : {})
  }
}

/** A stored list, or null when it isn't one (a newer or damaged record). */
export function parseStoredNativeChatStashList(
  key: string,
  value: unknown
): StoredNativeChatStashList | null {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return null
  }
  const scope = nativeChatStashScopeOfKey(key)
  if (!scope) {
    return null
  }
  const entries = value.entries
    .flatMap((entry) => parseEntry(entry) ?? [])
    .slice(0, MAX_NATIVE_CHAT_STASH_ENTRIES)
  return { ...scope, entries }
}
