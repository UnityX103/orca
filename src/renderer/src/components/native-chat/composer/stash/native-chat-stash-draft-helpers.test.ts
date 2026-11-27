// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStashedDraft,
  degradeMissingImages,
  missingPaths
} from './native-chat-stash-draft-helpers'
import {
  readNativeChatComposerDraft,
  updateNativeChatComposerDraft
} from '../../drafts/native-chat-composer-draft-store'
import { clearNativeChatComposerDraftsForTests } from '../../drafts/native-chat-draft-reset'
import { hydrateNativeChatComposerDrafts } from '../../drafts/native-chat-composer-draft-load'
import {
  createMemoryNativeChatComposerDraftStorage,
  setNativeChatComposerDraftStorageForTests
} from '../../drafts/native-chat-composer-draft-storage'

const SCOPE = 'tab:leaf'

/** A long-paste token the draft text can reference, so its path must survive a partial clear. */
const TOKEN = '[Pasted text](orca-paste:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)'
const PASTE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

beforeEach(async () => {
  clearNativeChatComposerDraftsForTests()
  setNativeChatComposerDraftStorageForTests(createMemoryNativeChatComposerDraftStorage())
  await hydrateNativeChatComposerDrafts()
})

describe('clearStashedDraft', () => {
  it('keeps a paste the still-live draft text references, instead of making it unsaved', () => {
    const archived = {
      text: `archived ${TOKEN}`,
      pastedTextFiles: { [PASTE_ID]: '/pastes/orca-paste-1.txt' },
      images: []
    }
    updateNativeChatComposerDraft(SCOPE, archived, 'immediate')

    // The user types while the write lands: their live text still names the same paste token.
    const liveToken = `user typed more ${TOKEN}`
    updateNativeChatComposerDraft(
      SCOPE,
      { text: liveToken, pastedTextFiles: archived.pastedTextFiles },
      'immediate'
    )

    clearStashedDraft(SCOPE, archived)

    // Readable through the real draft store: the paste mapping survives while its token is present.
    const after = readNativeChatComposerDraft(SCOPE)
    expect(after.pastedTextFiles).toEqual({ [PASTE_ID]: '/pastes/orca-paste-1.txt' })
    expect(after.text).toBe(liveToken)
  })

  it('drops an archived paste the draft no longer references', () => {
    const archived = {
      text: `archived ${TOKEN}`,
      pastedTextFiles: { [PASTE_ID]: '/pastes/orca-paste-1.txt' },
      images: []
    }
    updateNativeChatComposerDraft(SCOPE, archived, 'immediate')
    // The user removed the paste pill while the write landed.
    updateNativeChatComposerDraft(SCOPE, { text: 'typed without the paste' }, 'immediate')

    clearStashedDraft(SCOPE, archived)

    const after = readNativeChatComposerDraft(SCOPE)
    expect(after.pastedTextFiles).toBeUndefined()
    expect(after.text).toBe('typed without the paste')
  })
})

it('restores a nonpersistent browser file reference as a named placeholder', async () => {
  const images = [{ id: 'image', path: 'orca-browser-file:source/screenshot.png' }]

  expect(degradeMissingImages(images, await missingPaths(images))).toEqual([
    { id: 'image', path: '', unavailableName: 'screenshot.png' }
  ])
})
