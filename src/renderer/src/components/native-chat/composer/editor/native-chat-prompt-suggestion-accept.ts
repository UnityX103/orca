import type { KeyboardEvent } from 'react'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'

export function acceptNativeChatPromptSuggestion(
  event: KeyboardEvent<HTMLElement>,
  suggestion: string | undefined,
  input: NativeChatComposerInput | null,
  isComposing: () => boolean
): boolean {
  const plain = !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
  if (
    !suggestion ||
    !plain ||
    (event.key !== 'Enter' && event.key !== 'Tab' && event.key !== 'ArrowRight') ||
    isImeOwnedKeyboardEvent(event) ||
    isComposing() ||
    !input?.insertText ||
    input.disabled ||
    input.value !== ''
  ) {
    return false
  }
  event.preventDefault()
  input.insertText(suggestion)
  return true
}
