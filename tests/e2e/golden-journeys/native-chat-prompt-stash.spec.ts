import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from '@stablyai/playwright-test'
import { test } from '../desktop/electron-fixtures/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from '../desktop/renderer-probes/store'
import { showActivePaneAsNativeChat } from '../agents/session-fixtures/native-chat-view'
import { focusActiveTerminalInput } from '../terminal/input/terminal'

type ChatPage = Parameters<typeof waitForSessionReady>[0]

/** Playwright chord for the user's real `chat.stashPrompt` binding, so a rebind is exercised. */
async function stashChord(page: ChatPage): Promise<string> {
  const binding = await page.evaluate(
    () => window.__store?.getState().keybindings?.['chat.stashPrompt']?.[0] ?? 'Mod+S'
  )
  const isMac = process.platform === 'darwin'
  const parts = binding.split('+').map((part) => {
    if (part === 'Mod') {
      return isMac ? 'Meta' : 'Control'
    }
    if (part === 'Shift' || part === 'Alt') {
      return part
    }
    if (part === 'Ctrl') {
      return 'Control'
    }
    return part.length === 1 ? part.toUpperCase() : part
  })
  return parts.join('+')
}

async function openChat(page: ChatPage, title: string) {
  await showActivePaneAsNativeChat(page, 'codex', title)
  const editor = page.locator('[data-native-chat-prompt-editor]')
  await expect(editor).toBeVisible({ timeout: 20_000 })
  return editor
}

test.describe('native chat prompt stash', () => {
  test.beforeEach(async ({ orcaPage }) => {
    await orcaPage.setViewportSize({ width: 1440, height: 900 })
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test('stashes on the bound chord, then restores into an emptied composer', async ({
    orcaPage
  }) => {
    const editor = await openChat(orcaPage, 'Stash Chat')
    const chord = await stashChord(orcaPage)

    await editor.click()
    await orcaPage.keyboard.type('first stashed prompt')
    await orcaPage.keyboard.press(chord)

    const badge = orcaPage.locator('[data-native-chat-stash-badge]')
    await expect(badge).toHaveAttribute('aria-label', /1/)
    await expect(editor).toHaveText('')

    // Empty composer + one entry: the same chord restores it and removes the entry.
    await orcaPage.keyboard.press(chord)
    await expect(editor).toHaveText('first stashed prompt')
    await expect(badge).toHaveCount(0)
  })

  test('appends a restored entry after existing input rather than overwriting', async ({
    orcaPage
  }) => {
    const editor = await openChat(orcaPage, 'Stash Chat')

    await editor.click()
    await orcaPage.keyboard.type('archived line')
    await orcaPage.keyboard.press(await stashChord(orcaPage))
    await expect(orcaPage.locator('[data-native-chat-stash-badge]')).toHaveCount(1)

    // Restore from the list while the composer holds text: the text appends, it is not overwritten.
    await editor.click()
    await orcaPage.keyboard.type('live line')
    await expect(editor).toHaveText('live line')
    await orcaPage.locator('[data-native-chat-stash-badge]').click()
    await orcaPage.locator('[data-stash-restore]').first().click()

    const paragraphs = editor.locator('p')
    await expect(paragraphs.nth(0)).toHaveText('live line')
    await expect(paragraphs.nth(1)).toHaveText('')
    await expect(paragraphs.nth(2)).toHaveText('archived line')
    await expect(orcaPage.locator('[data-native-chat-stash-badge]')).toHaveCount(0)
  })

  test('lists entries newest first and deletes one', async ({ orcaPage }) => {
    const editor = await openChat(orcaPage, 'Stash Chat')
    const chord = await stashChord(orcaPage)

    for (const text of ['older entry', 'newer entry']) {
      await editor.click()
      await orcaPage.keyboard.type(text)
      await orcaPage.keyboard.press(chord)
      await expect(orcaPage.locator('[data-native-chat-stash-badge]')).toBeVisible()
    }

    await editor.click()
    await orcaPage.locator('[data-native-chat-stash-badge]').click()
    const rows = orcaPage.locator('[data-stash-restore]')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('newer entry')
    await expect(rows.nth(1)).toContainText('older entry')

    await orcaPage.getByRole('button', { name: 'Delete stashed prompt' }).first().click()
    await expect(rows).toHaveCount(1)
    await expect(rows.nth(0)).toContainText('older entry')
  })

  test('a rebind moves the stash off the default save chord', async ({ orcaPage }) => {
    const editor = await openChat(orcaPage, 'Stash Chat')
    const rebind = 'Mod+Shift+K'
    // Persist through the same path the settings UI uses, so the dispatcher sees the new binding.
    await orcaPage.evaluate(async (binding) => {
      await window.__store?.getState().setKeybindingOverride('chat.stashPrompt', [binding])
    }, rebind)
    const rebound = process.platform === 'darwin' ? 'Meta+Shift+K' : 'Control+Shift+K'

    await editor.click()
    await orcaPage.keyboard.type('rebound stash')
    // The default save chord is now free: it must not stash.
    await orcaPage.keyboard.press('ControlOrMeta+S')
    await expect(orcaPage.locator('[data-native-chat-stash-badge]')).toHaveCount(0)
    // The rebound chord stashes.
    await orcaPage.keyboard.press(rebound)
    await expect(orcaPage.locator('[data-native-chat-stash-badge]')).toHaveCount(1)
  })

  test('Mod+S does not stash while a terminal, not the chat, holds focus', async ({ orcaPage }) => {
    // The finalized chat leaves its composer behind; focus the terminal so the chord reaches the shell.
    await openChat(orcaPage, 'Stash Chat')
    await focusActiveTerminalInput(orcaPage)
    await orcaPage.keyboard.press('ControlOrMeta+S')
    await expect(orcaPage.locator('[data-native-chat-stash-badge]')).toHaveCount(0)
  })

  test('saves a tracked file from the real editor and creates no chat stash', async ({
    orcaPage,
    testRepoPath
  }) => {
    // A real markdown save on the same chord must still write the file, not stash a chat draft.
    const readmePath = path.join(testRepoPath, 'README.md')
    await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      state?.setRightSidebarTab('explorer')
      state?.setRightSidebarOpen(true)
    })
    const explorer = orcaPage.locator('[data-orca-explorer-shell]')
    const readmeRow = explorer.locator('[data-file-explorer-row]').filter({
      has: orcaPage.getByText('README.md', { exact: true })
    })
    await expect(readmeRow).toBeVisible({ timeout: 15_000 })
    await readmeRow.click()
    const editor = orcaPage.locator('.rich-markdown-editor')
    await expect(editor).toBeVisible({ timeout: 25_000 })
    await editor.click()
    await orcaPage.keyboard.press('ControlOrMeta+End')
    const sentinel = `stash-save-${Date.now()}`
    await orcaPage.keyboard.type(`\n${sentinel}`)
    await orcaPage.keyboard.press('ControlOrMeta+S')

    await expect
      .poll(() => readFileSync(readmePath, 'utf8'), { timeout: 10_000 })
      .toContain(sentinel)
    await expect(orcaPage.locator('[data-native-chat-stash-badge]')).toHaveCount(0)
  })
})
