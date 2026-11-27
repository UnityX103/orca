// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNativeChatStashShortcut } from './use-native-chat-stash-shortcut'
import { installAppKeyboardRouter } from '@/lib/keyboard/app-keyboard-router'
import { useAppStore } from '@/store/index'

function composer(scopeKey: string): HTMLElement {
  const root = document.createElement('div')
  root.dataset.nativeChatComposerScope = scopeKey
  const editor = document.createElement('div')
  editor.dataset.nativeChatPromptEditor = 'true'
  editor.setAttribute('contenteditable', 'true')
  root.append(editor)
  document.body.append(root)
  return editor
}

/** Press Mod+S where the browser would deliver it: on the focused editor element. */
function pressModS(target: HTMLElement): KeyboardEvent {
  // `Mod` is Cmd on macOS and Ctrl elsewhere; the listener resolves it the same way.
  const isMac = navigator.userAgent.includes('Mac')
  const event = new KeyboardEvent('keydown', {
    key: 's',
    code: 'KeyS',
    metaKey: isMac,
    ctrlKey: !isMac,
    bubbles: true,
    cancelable: true
  })
  target.dispatchEvent(event)
  return event
}

let unmounts: (() => void)[] = []

beforeEach(() => {
  installAppKeyboardRouter(window)
  useAppStore.setState({ keybindings: {} })
})

afterEach(() => {
  unmounts.forEach((unmount) => unmount())
  unmounts = []
  document.body.innerHTML = ''
})

describe('useNativeChatStashShortcut', () => {
  it('runs only for the composer that holds the key in a split layout', () => {
    const leftRun = vi.fn()
    const rightRun = vi.fn()
    // Left registers first, as an earlier-mounted pane would.
    unmounts.push(
      renderHook(() =>
        useNativeChatStashShortcut({
          enabled: true,
          scopeKey: 'tab:leaf-left',
          isComposing: () => false,
          run: leftRun
        })
      ).unmount
    )
    unmounts.push(
      renderHook(() =>
        useNativeChatStashShortcut({
          enabled: true,
          scopeKey: 'tab:leaf-right',
          isComposing: () => false,
          run: rightRun
        })
      ).unmount
    )

    const event = pressModS(composer('tab:leaf-right'))

    // Only the right composer's scope matches, so the first-mounted one never claims another's key.
    expect(rightRun).toHaveBeenCalledTimes(1)
    expect(leftRun).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores the chord in a non-chat editor so the file save still runs', () => {
    const run = vi.fn()
    unmounts.push(
      renderHook(() =>
        useNativeChatStashShortcut({
          enabled: true,
          scopeKey: 'tab:leaf-left',
          isComposing: () => false,
          run
        })
      ).unmount
    )
    const plain = document.createElement('div')
    plain.setAttribute('contenteditable', 'true')
    document.body.append(plain)

    const event = pressModS(plain)

    expect(run).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('stays silent while an IME composition owns the key', () => {
    const run = vi.fn()
    unmounts.push(
      renderHook(() =>
        useNativeChatStashShortcut({
          enabled: true,
          scopeKey: 'tab:leaf-left',
          isComposing: () => true,
          run
        })
      ).unmount
    )

    const event = pressModS(composer('tab:leaf-left'))

    expect(run).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
