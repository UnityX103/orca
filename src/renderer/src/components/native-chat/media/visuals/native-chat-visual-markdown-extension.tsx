import { useMemo, useState, type ComponentPropsWithoutRef } from 'react'
import type { ExtraProps } from 'react-markdown'
import type { CommentMarkdownExtension } from '@/components/comment-markdown/CommentMarkdown'
import {
  NATIVE_CHAT_CODEX_VISUAL_PREFIX,
  NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH,
  NATIVE_CHAT_VISUAL_DIRECTIVE_MARKER,
  isNativeChatVisualFileName,
  isNativeChatVisualPath
} from '../../../../../../shared/native-chat/visuals/native-chat-visual-directive'
import { WEBHOOK_HOOK_ID_PATTERN } from '../../../../../../shared/connector-webhook-contract'
import { NativeChatInlineVisual } from './NativeChatInlineVisual'
import { NativeChatWebhookCard } from '../../NativeChatWebhookCard'
import type { NativeChatVisualOwner } from './native-chat-visual-owner'
import { useNativeChatVisualOwner } from './native-chat-visual-owner'
import {
  NATIVE_CHAT_VISUAL_PLACEHOLDER_PROPERTIES,
  nativeChatVisualRemarkPlugins
} from './native-chat-visual-markdown-syntax'

type DivProps = ComponentPropsWithoutRef<'div'> & ExtraProps

function placeholderAttributes(props: DivProps): {
  nonce: unknown
  file: unknown
  title: unknown
  hook: unknown
  path: unknown
  wide: unknown
} {
  return {
    nonce: 'data-orca-visual' in props ? props['data-orca-visual'] : undefined,
    file: 'data-orca-visual-file' in props ? props['data-orca-visual-file'] : undefined,
    title: 'data-orca-visual-title' in props ? props['data-orca-visual-title'] : undefined,
    hook: 'data-orca-visual-hook' in props ? props['data-orca-visual-hook'] : undefined,
    path: 'data-orca-visual-path' in props ? props['data-orca-visual-path'] : undefined,
    wide: 'data-orca-visual-wide' in props ? props['data-orca-visual-wide'] : undefined
  }
}

function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createVisualExtension(
  owner: NativeChatVisualOwner,
  nonce: string
): CommentMarkdownExtension {
  function VisualPlaceholder({ node: _node, ...props }: DivProps): React.JSX.Element {
    const { nonce: placeholderNonce, file, title, hook, path, wide } = placeholderAttributes(props)
    // Only the parser's own placeholders carry this message's nonce; the fields are re-checked anyway.
    if (
      placeholderNonce === nonce &&
      typeof hook === 'string' &&
      WEBHOOK_HOOK_ID_PATTERN.test(hook)
    ) {
      return <NativeChatWebhookCard owner={owner} hookId={hook} />
    }
    const titleValid =
      title === undefined ||
      (typeof title === 'string' && title.length <= NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH)
    const hasPath = typeof path === 'string' && isNativeChatVisualPath(path)
    if (
      placeholderNonce !== nonce ||
      !titleValid ||
      (!hasPath && (typeof file !== 'string' || !isNativeChatVisualFileName(file)))
    ) {
      return <div {...props} />
    }
    return (
      <NativeChatInlineVisual
        owner={owner}
        file={typeof file === 'string' ? file : null}
        path={hasPath ? path : null}
        wide={wide === 'true'}
        title={typeof title === 'string' && title.length > 0 ? title : null}
      />
    )
  }
  return {
    remarkPlugins: nativeChatVisualRemarkPlugins(nonce),
    // Hold a mid-stream Codex-reference line too, so its JSON never flashes as text.
    extraFlowSyntaxMarkers: [NATIVE_CHAT_VISUAL_DIRECTIVE_MARKER, NATIVE_CHAT_CODEX_VISUAL_PREFIX],
    sanitizeAttributes: { div: [...NATIVE_CHAT_VISUAL_PLACEHOLDER_PROPERTIES] },
    components: { div: VisualPlaceholder }
  }
}

/** Keep the structured message’s extension stable so streaming preserves its mounted visual frame. */
export function useNativeChatVisualMarkdownExtension(
  messageId: string | undefined
): CommentMarkdownExtension | undefined {
  const owner = useNativeChatVisualOwner()
  const [nonce] = useState(newNonce)
  return useMemo(
    () => (owner && messageId ? createVisualExtension(owner, nonce) : undefined),
    [messageId, nonce, owner]
  )
}
