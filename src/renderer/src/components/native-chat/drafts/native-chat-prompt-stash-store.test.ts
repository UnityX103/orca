// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearNativeChatPromptStashForTests,
  deleteNativeChatStashesOwnedBy,
  hydrateNativeChatPromptStash,
  isNativeChatPromptStashLoadFailed,
  readNativeChatStashEntries,
  stashNativeChatDraft,
  takeNativeChatStashEntry,
  tombstoneNativeChatStashesOwnedBy
} from './native-chat-prompt-stash-store'
import {
  claimNativeChatStashEntry,
  clearNativeChatStashClaimsForTests
} from './native-chat-prompt-stash-claim'
import {
  MAX_NATIVE_CHAT_STASH_ENTRIES,
  MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS,
  createMemoryNativeChatStashStorage,
  nativeChatStashScopeKey,
  setNativeChatStashStorageForTests,
  type NativeChatStashStorage,
  type NativeChatStashScope
} from './native-chat-prompt-stash-storage'

const SCOPE: NativeChatStashScope = { workspaceId: 'worktree:one', executionHostId: 'local' }
const OTHER_HOST: NativeChatStashScope = { workspaceId: 'worktree:one', executionHostId: 'ssh:h1' }

function seedStorage() {
  const storage = createMemoryNativeChatStashStorage()
  setNativeChatStashStorageForTests(storage)
  return storage
}

/** A storage whose load fails until released, so a failed load's write path can be exercised. */
function failingLoadStorage(backing: NativeChatStashStorage): NativeChatStashStorage & {
  failLoad: boolean
} {
  const wrapper = {
    failLoad: true,
    loadAll: () =>
      wrapper.failLoad ? Promise.reject(new Error('database is blocked')) : backing.loadAll(),
    write: backing.write,
    remove: backing.remove
  }
  return wrapper
}

beforeEach(() => {
  clearNativeChatPromptStashForTests()
  clearNativeChatStashClaimsForTests()
  seedStorage()
})

describe('native chat prompt stash', () => {
  it('keeps saved entries when a stash is written before hydration lands', async () => {
    const storage = createMemoryNativeChatStashStorage()
    setNativeChatStashStorageForTests(storage)
    // A previous run's entry already in IndexedDB, not yet loaded into memory.
    await storage.write(nativeChatStashScopeKey(SCOPE), {
      ...SCOPE,
      entries: [{ id: 'old', createdAt: 1, draft: { text: 'yesterday', images: [] } }]
    })

    const result = await stashNativeChatDraft(SCOPE, { text: 'today', images: [] }, 2, 'new')

    expect(result).toEqual({ ok: true })
    expect(readNativeChatStashEntries(SCOPE).map((entry) => entry.id)).toEqual(['new', 'old'])
    // The write must include the loaded entry, not overwrite the saved list with only the new one.
    expect(storage.stashes.get(nativeChatStashScopeKey(SCOPE))?.entries.map((e) => e.id)).toEqual([
      'new',
      'old'
    ])
  })

  it('refuses to write and reports unavailable when the load failed, never overwriting saved records', async () => {
    const storage = createMemoryNativeChatStashStorage()
    // A previous run's saved entry the failed load never read.
    await storage.write(nativeChatStashScopeKey(SCOPE), {
      ...SCOPE,
      entries: [{ id: 'saved', createdAt: 1, draft: { text: 'must survive', images: [] } }]
    })
    setNativeChatStashStorageForTests(failingLoadStorage(storage))

    const result = await stashNativeChatDraft(SCOPE, { text: 'new', images: [] }, 2, 'new')

    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(isNativeChatPromptStashLoadFailed()).toBe(true)
    // The saved record is untouched: the failed write ran no load and wrote nothing.
    expect(storage.stashes.get(nativeChatStashScopeKey(SCOPE))?.entries.map((e) => e.id)).toEqual([
      'saved'
    ])
  })

  it('retries a failed load on the next call', async () => {
    const storage = createMemoryNativeChatStashStorage()
    await storage.write(nativeChatStashScopeKey(SCOPE), {
      ...SCOPE,
      entries: [{ id: 'saved', createdAt: 1, draft: { text: 'survives', images: [] } }]
    })
    const wrapper = failingLoadStorage(storage)
    setNativeChatStashStorageForTests(wrapper)
    expect(await hydrateNativeChatPromptStash()).toBe(false)

    wrapper.failLoad = false
    expect(await hydrateNativeChatPromptStash()).toBe(true)
    expect(readNativeChatStashEntries(SCOPE).map((entry) => entry.id)).toEqual(['saved'])
  })

  it('charges the entry budget on measured attachment bytes, not the path length', async () => {
    await hydrateNativeChatPromptStash()
    const overBudget = async () => MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS + 1

    await stashNativeChatDraft(
      SCOPE,
      { text: 'with image', images: [{ id: 'a', path: '/tmp/shot.png' }] },
      1,
      'entry',
      overBudget
    )

    const [entry] = readNativeChatStashEntries(SCOPE)
    expect(entry.draft.images).toEqual([{ id: 'a', path: '', unavailableName: 'shot.png' }])
    expect(entry.droppedAttachmentNames).toEqual(['shot.png'])
  })

  it('keeps an attachment whose measured bytes fit, even when its path is long', async () => {
    await hydrateNativeChatPromptStash()
    const longPath = `/${'x'.repeat(MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS)}/shot.png`
    const smallFile = async () => 1024

    await stashNativeChatDraft(
      SCOPE,
      { text: 'text', images: [{ id: 'a', path: longPath }] },
      1,
      'entry',
      smallFile
    )

    const [entry] = readNativeChatStashEntries(SCOPE)
    expect(entry.draft.images).toEqual([{ id: 'a', path: longPath }])
    expect(entry.droppedAttachmentNames).toBeUndefined()
  })

  it('never counts the body text against the attachment budget', async () => {
    await hydrateNativeChatPromptStash()
    const bigText = 'x'.repeat(MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS + 100)

    await stashNativeChatDraft(
      SCOPE,
      { text: bigText, images: [{ id: 'a', path: '/tmp/shot.png' }] },
      1,
      'entry',
      async () => 4096
    )

    const [entry] = readNativeChatStashEntries(SCOPE)
    expect(entry.draft.text).toBe(bigText)
    expect(entry.draft.images).toEqual([{ id: 'a', path: '/tmp/shot.png' }])
  })

  it('charges an over-budget managed paste into a named placeholder, not a dropped path', async () => {
    await hydrateNativeChatPromptStash()
    const overBudget = async () => MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS + 1
    const pastePath = '/pastes/orca-paste-1234567890-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.txt'

    await stashNativeChatDraft(
      SCOPE,
      {
        text: 'see [Pasted text](orca-paste:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)',
        images: [],
        pastedTextFiles: { 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': pastePath }
      },
      1,
      'entry',
      overBudget
    )

    const [entry] = readNativeChatStashEntries(SCOPE)
    expect(entry.draft.pastedTextFiles).toBeUndefined()
    expect(entry.draft.pastedTextUnavailable).toEqual({
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': pastePath.split('/').pop()
    })
    expect(entry.droppedAttachmentNames).toEqual([pastePath.split('/').pop()])
  })

  it('spends one budget across images and pasted files together', async () => {
    await hydrateNativeChatPromptStash()
    const half = MAX_NATIVE_CHAT_STASH_ENTRY_ATTACHMENT_CHARS / 2
    const pasteId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

    await stashNativeChatDraft(
      SCOPE,
      {
        text: `pic [Pasted text](orca-paste:${pasteId})`,
        images: [{ id: 'img', path: '/tmp/a.png' }],
        pastedTextFiles: { [pasteId]: '/tmp/b.txt' }
      },
      1,
      'entry',
      async (image) => (image.path === '/tmp/a.png' ? half + 1 : half + 1)
    )

    const [entry] = readNativeChatStashEntries(SCOPE)
    // The first attachment fits; the second pushes past the shared budget and degrades.
    expect(entry.draft.images).toEqual([{ id: 'img', path: '/tmp/a.png' }])
    expect(entry.draft.pastedTextUnavailable).toEqual({ [pasteId]: 'b.txt' })
  })

  it('caps a workspace at 100 entries and reports full without dropping the current input', async () => {
    await hydrateNativeChatPromptStash()
    for (let index = 0; index < MAX_NATIVE_CHAT_STASH_ENTRIES; index += 1) {
      await stashNativeChatDraft(SCOPE, { text: `draft ${index}`, images: [] }, index, `e${index}`)
    }

    const result = await stashNativeChatDraft(SCOPE, { text: 'overflow', images: [] }, 999, 'x')

    expect(result).toEqual({ ok: false, reason: 'full' })
    expect(readNativeChatStashEntries(SCOPE)).toHaveLength(MAX_NATIVE_CHAT_STASH_ENTRIES)
  })

  it('keeps an entry when its removal write fails, so it is not lost', async () => {
    const storage = seedStorage()
    await hydrateNativeChatPromptStash()
    await stashNativeChatDraft(SCOPE, { text: 'keep me', images: [] }, 1, 'entry')
    storage.refuseWrites = true

    const taken = await takeNativeChatStashEntry(SCOPE, 'entry')

    expect(taken).toBeNull()
    expect(readNativeChatStashEntries(SCOPE).map((entry) => entry.id)).toEqual(['entry'])
  })

  it('isolates stashes by host and clears only the removed workspace', async () => {
    await hydrateNativeChatPromptStash()
    await stashNativeChatDraft(SCOPE, { text: 'local', images: [] }, 1, 'a')
    await stashNativeChatDraft(OTHER_HOST, { text: 'remote', images: [] }, 2, 'b')

    expect(readNativeChatStashEntries(SCOPE)).toHaveLength(1)
    expect(readNativeChatStashEntries(OTHER_HOST)).toHaveLength(1)

    await deleteNativeChatStashesOwnedBy(SCOPE)

    expect(readNativeChatStashEntries(SCOPE)).toHaveLength(0)
    expect(readNativeChatStashEntries(OTHER_HOST)).toHaveLength(1)
  })

  it('lets only one of two competing restorers claim the same entry', async () => {
    await hydrateNativeChatPromptStash()
    await stashNativeChatDraft(SCOPE, { text: 'one copy', images: [] }, 1, 'entry')

    // Two composers (independent `busy` refs) both try to restore the same row.
    const first = claimNativeChatStashEntry(SCOPE, 'entry')
    const second = claimNativeChatStashEntry(SCOPE, 'entry')

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    // The winner reads the latest stored copy, not a stale render.
    expect(first!.entry.draft.text).toBe('one copy')
    first!.release()
    // Released: a retry (e.g. after a refused write) may claim it again.
    const retry = claimNativeChatStashEntry(SCOPE, 'entry')
    expect(retry).not.toBeNull()
    retry!.release()
  })

  it('keeps the entry after a failed restore that releases its claim', async () => {
    await hydrateNativeChatPromptStash()
    await stashNativeChatDraft(SCOPE, { text: 'keep on failure', images: [] }, 1, 'entry')

    const claim = claimNativeChatStashEntry(SCOPE, 'entry')!
    claim.release() // the draft write was refused, so restore releases instead of deleting

    expect(readNativeChatStashEntries(SCOPE).map((entry) => entry.id)).toEqual(['entry'])
    expect(claimNativeChatStashEntry(SCOPE, 'entry')).not.toBeNull()
  })

  it('tombstones a workspace synchronously so a first stash after removal cannot create its key', async () => {
    await hydrateNativeChatPromptStash()
    // No entry yet: this is the workspace's FIRST stash, which would otherwise create its key.
    tombstoneNativeChatStashesOwnedBy(SCOPE)

    const result = await stashNativeChatDraft(SCOPE, { text: 'after removal', images: [] }, 1, 'x')

    expect(result).toEqual({ ok: false, reason: 'removed' })
    expect(readNativeChatStashEntries(SCOPE)).toHaveLength(0)
  })

  it('does not let an in-flight stash write recreate a workspace removed meanwhile', async () => {
    const storage = seedStorage()
    await hydrateNativeChatPromptStash()
    await stashNativeChatDraft(SCOPE, { text: 'first', images: [] }, 1, 'first')
    // Hold the next write open so removal races it.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const realWrite = storage.write.bind(storage)
    storage.write = async (key, list) => {
      await gate
      return realWrite(key, list)
    }

    const inFlight = stashNativeChatDraft(SCOPE, { text: 'second', images: [] }, 2, 'second')
    // Removal waits for the queued write, then tombstones the key so it cannot land after.
    const removal = deleteNativeChatStashesOwnedBy(SCOPE)
    release()
    await inFlight
    await removal
    storage.write = realWrite

    expect(readNativeChatStashEntries(SCOPE)).toHaveLength(0)
    expect(storage.stashes.has(nativeChatStashScopeKey(SCOPE))).toBe(false)
  })
})
