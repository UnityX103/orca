import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { expect } from '@stablyai/playwright-test'
import { test } from '../desktop/electron-fixtures/orca-app'
import {
  attachRepoAndOpenTerminal,
  createRestartSession
} from '../desktop/electron-fixtures/orca-restart'
import { ensureTerminalVisible, waitForSessionReady } from '../desktop/renderer-probes/store'
import { waitForActivePaneHookDescriptor } from '../terminal/input/terminal-active-pane'

type StashE2E = {
  attachPastedText: (scopeKey: string, text: string, pasteId: string) => Promise<string>
}

/**
 * Force the active pane to show its Native Chat composer and return its scope key. On a restored
 * launch `viewMode` can already be 'chat', so `toggleTabViewMode` would flip it back to the terminal;
 * `setTabViewMode('chat')` is idempotent. Returns the composer scope (the pane key).
 */
async function showRestoredComposerAsChat(
  page: Parameters<typeof waitForSessionReady>[0]
): Promise<{
  editor: ReturnType<Parameters<typeof waitForSessionReady>[0]['locator']>
  scopeKey: string
}> {
  const descriptor = await waitForActivePaneHookDescriptor(page)
  await page.evaluate(async ({ paneKey }) => {
    const settings = await window.api.settings.set({
      nativeChatProviders: { claude: true, codex: true }
    })
    const store = window.__store
    if (!store) {
      throw new Error('Store unavailable')
    }
    store.setState({ settings })
    const state = store.getState()
    const [tabId] = paneKey.split(':')
    const tab = (state.unifiedTabsByWorktree[state.activeWorktreeId ?? ''] ?? []).find(
      (candidate) => candidate.contentType === 'terminal' && candidate.entityId === tabId
    )
    if (!tab) {
      throw new Error('Terminal tab unavailable')
    }
    state.setAgentStatus(
      paneKey,
      { state: 'done', agentType: 'codex', prompt: '' },
      'Stash Restart',
      undefined,
      { worktreeId: state.activeWorktreeId ?? '' }
    )
    state.setTabViewMode(tab.id, 'chat')
  }, descriptor)
  const editor = page.locator('[data-native-chat-prompt-editor]')
  await expect(editor).toBeVisible({ timeout: 25_000 })
  const scopeKey = await page
    .locator('[data-native-chat-composer-scope]')
    .first()
    .getAttribute('data-native-chat-composer-scope')
  if (!scopeKey) {
    throw new Error('Composer scope missing')
  }
  return { editor, scopeKey }
}

// One profile across two launches: the stash must survive the app closing and reopening and restore
// into a real composer, keeping a readable pasted-text file and degrading a genuinely lost one to a
// named placeholder — while preserving any live input typed after the relaunch.
test.describe('native chat prompt stash across a restart', () => {
  test('restores a readable paste and a lost paste as a named placeholder in a real composer', async ({
    testRepoPath: repoPath
  }, testInfo) => {
    const session = createRestartSession(testInfo)
    const first = await session.launch()
    const lostText = `lost pasted body ${'x'.repeat(40 * 1024)}`
    const readableText = `readable pasted body ${'y'.repeat(40 * 1024)}`
    let lostPath = ''
    let readablePath = ''
    try {
      await waitForSessionReady(first.page)
      await attachRepoAndOpenTerminal(first.page, repoPath)
      await ensureTerminalVisible(first.page)
      const { editor, scopeKey } = await showRestoredComposerAsChat(first.page)

      // Fixture: the OS clipboard entry is faked, but the file is written by the real app IPC and the
      // draft is written through the store the composer reads — the same state a real paste produces.
      const archivePaste = async (
        text: string,
        pasteId: string,
        count: number
      ): Promise<string> => {
        const savedPath = await first.page.evaluate(
          async ({ scopeKey, text, pasteId }) => {
            // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the e2e window carries an e2e-only fixture field the global Window type omits; read through one typed handle.
            const win = window as unknown as { __nativeChatStashE2E?: StashE2E }
            const api = win.__nativeChatStashE2E
            if (!api) {
              throw new Error('stash e2e fixture unavailable')
            }
            return api.attachPastedText(scopeKey, text, pasteId)
          },
          { scopeKey, text, pasteId }
        )
        await expect(editor).toContainText('pasted')
        await editor.click()
        await first.page.keyboard.press(stashChord())
        // The badge count and empty composer follow the committed write.
        await expect(first.page.locator('[data-native-chat-stash-badge]')).toHaveAttribute(
          'aria-label',
          new RegExp(`\\b${count}\\b`)
        )
        await expect(editor).toHaveText('')
        return savedPath
      }

      lostPath = await archivePaste(lostText, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 1)
      readablePath = await archivePaste(readableText, 'ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb', 2)
      expect(readablePath).not.toBe(lostPath)
    } finally {
      await session.close(first.app)
    }

    // Delete the real paste file before relaunch: restore must show a named placeholder, not a path.
    rmSync(lostPath)

    const second = await session.launch()
    try {
      await waitForSessionReady(second.page)
      await attachRepoAndOpenTerminal(second.page, repoPath)
      await ensureTerminalVisible(second.page)
      const { editor } = await showRestoredComposerAsChat(second.page)

      const badge = second.page.locator('[data-native-chat-stash-badge]')
      await expect(badge).toHaveAttribute('aria-label', /\b2\b/, { timeout: 20_000 })

      // Protect live input typed after relaunch; restoring appends, it never overwrites.
      await editor.click()
      await second.page.keyboard.type('fresh after restart')
      await badge.click()
      await second.page.locator('[data-stash-restore]').first().click()

      const readablePill = editor.locator('[data-native-chat-file-reference]')
      await expect(readablePill).toHaveAttribute('data-native-chat-file-reference', readablePath)
      expect(readFileSync(readablePath, 'utf8')).toBe(readableText)
      await expect(badge).toHaveAttribute('aria-label', /\b1\b/)
      await badge.click()
      await second.page.locator('[data-stash-restore]').first().click()

      await expect(editor).toContainText('fresh after restart')
      // The lost paste shows as a named placeholder (its file name, marked unavailable), never a path.
      const unavailablePill = second.page.locator('[data-native-chat-file-unavailable="true"]')
      await expect(unavailablePill).toHaveCount(1, { timeout: 10_000 })
      await expect(unavailablePill).toContainText(path.basename(lostPath))
      await expect(badge).toHaveCount(0)
    } finally {
      await session.dispose(second.app)
    }
  })
})

function stashChord(): string {
  return process.platform === 'darwin' ? 'Meta+s' : 'Control+s'
}
