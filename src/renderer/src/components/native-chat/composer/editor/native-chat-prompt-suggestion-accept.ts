import type { KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'

export function acceptNativeChatPromptSuggestion(
  event: KeyboardEvent<HTMLElement>,
  suggestion: string | undefined,
  input: NativeChatComposerInput | null,
  isComposing: () => boolean,
  send: () => void
): boolean {
  const plain = !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
  const submit = event.key === 'Enter'
  if (
    !suggestion ||
    !plain ||
    (!submit && event.key !== 'Tab' && event.key !== 'ArrowRight') ||
    isImeOwnedKeyboardEvent(event) ||
    isComposing() ||
    !input?.insertText ||
    input.disabled ||
    input.value !== ''
  ) {
    return false
  }
  event.preventDefault()
  if (!submit) {
    input.insertText(suggestion)
  } else if (!event.repeat) {
    const insertText = input.insertText
    // The existing sender reads the committed draft from the latest render.
    flushSync(() => insertText(suggestion))
    send()
  }
  return true
}
