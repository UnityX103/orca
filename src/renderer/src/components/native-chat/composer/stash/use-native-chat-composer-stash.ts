import { useCallback } from 'react'
import {
  useNativeChatPromptStash,
  type NativeChatPromptStash
} from './use-native-chat-prompt-stash'
import { useNativeChatStashShortcut } from './use-native-chat-stash-shortcut'

/** Wire the stash and its shortcut for one composer; detached from the pane to keep it within its line budget. */
export function useNativeChatComposerStash(args: {
  enabled: boolean
  draftScopeKey: string
  draft: string
  fallbackWorkspaceId?: string
  disabled: boolean
  pastedTextSaving: boolean
  focusComposer: () => void
  isComposing: () => boolean
}): NativeChatPromptStash | null {
  const stash = useNativeChatPromptStash({
    draftScopeKey: args.draftScopeKey,
    draft: args.draft,
    ...(args.fallbackWorkspaceId ? { fallbackWorkspaceId: args.fallbackWorkspaceId } : {}),
    disabled: args.disabled,
    pastedTextSaving: args.pastedTextSaving,
    focusComposer: args.focusComposer
  })
  const run = useCallback(() => stash?.stashOrRestore(), [stash])
  useNativeChatStashShortcut({
    enabled: args.enabled && stash !== null,
    scopeKey: args.draftScopeKey,
    isComposing: args.isComposing,
    run
  })
  return stash
}
