import { useEffect } from 'react'
import { keybindingMatchesAction } from '../../../../../../shared/keybindings/matching'
import { getShortcutPlatform } from '@/lib/keyboard/shortcut-platform'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/keyboard/app-keyboard-router'
import { isNativeChatPromptTarget } from '@/lib/text-input/focus/editable-target'
import { useAppStore } from '@/store/index'

/** The composer scope a key event landed in, or null when it is not a chat prompt. */
function composerScopeOf(target: EventTarget | null): string | null {
  if (!isNativeChatPromptTarget(target) || !(target instanceof Element)) {
    return null
  }
  return (
    target.closest<HTMLElement>('[data-native-chat-composer-scope]')?.dataset
      .nativeChatComposerScope ?? null
  )
}

/**
 * Runs `chat.stashPrompt` for the composer that actually holds focus. Split panes each register a
 * window listener, so the scope check keeps an earlier-mounted composer from claiming another's key.
 */
export function useNativeChatStashShortcut(args: {
  enabled: boolean
  scopeKey: string
  isComposing: () => boolean
  run: () => void
}): void {
  const { enabled, scopeKey, isComposing, run } = args
  useEffect(() => {
    if (!enabled) {
      return
    }
    const platform = getShortcutPlatform()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.keyCode === 229 ||
        isComposing()
      ) {
        return
      }
      // Only the focused composer runs the chord; its scope must be this one, not a sibling pane's.
      if (composerScopeOf(event.target) !== scopeKey) {
        return
      }
      if (
        !keybindingMatchesAction(
          'chat.stashPrompt',
          event,
          platform,
          useAppStore.getState().keybindings
        )
      ) {
        return
      }
      // Claim it, so the window's own Save / browser save dialog never sees it.
      event.preventDefault()
      event.stopPropagation()
      run()
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [enabled, isComposing, run, scopeKey])
}
