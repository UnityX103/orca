import { useContext } from 'react'
import { NativeChatTextAttachmentOpener } from '../../media/text/NativeChatTextAttachments'
import { isCommittedChatAttachmentCandidate } from '../../../../../../shared/native-chat/attachments/native-chat-text-attachment-references'
import {
  useNativeChatPastedTextScope,
  useNativeChatPastedTextState
} from './native-chat-pasted-text-state'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { FileX, Hourglass } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { basename } from '@/lib/path'
import { getFileTypeIcon } from '@/lib/file-icons/file-type-icons'
import { NativeChatPromptPill } from './NativeChatPromptPill'
import { isNativeChatPastedTextPath } from '../../../../../../shared/native-chat/attachments/native-chat-image-label'
import {
  nativeChatPastedTextOperations,
  nativeChatPasteNotSavedNotice,
  nativeChatPastedTextId,
  nativeChatPastedTextLabel
} from '../../paste/native-chat-pasted-text-reference'
import { nativeChatPastedTextUnavailableName as unavailableNameOf } from '../../paste/native-chat-composer-pasted-text-references'

export function NativeChatFileReferencePill({ node, selected }: NodeViewProps): React.JSX.Element {
  const t = useTranslate()
  const state = useNativeChatPastedTextState(String(node.attrs.token))
  const unavailableName = unavailableNameOf(state)
  const path =
    state && !unavailableName && state !== 'saving' && state !== 'unsaved'
      ? state
      : String(node.attrs.path)
  const pasteId = nativeChatPastedTextId(String(node.attrs.token))
  // A paste's pill with no saving behind it was lost to a restart: its text was only in memory.
  const open = useContext(NativeChatTextAttachmentOpener)
  const scope = useNativeChatPastedTextScope()
  const live = pasteId ? nativeChatPastedTextOperations.get(pasteId) : undefined
  const canOpen =
    !unavailableName &&
    open &&
    (live?.scopeKey === scope || isCommittedChatAttachmentCandidate(path))
  const unsaved = state === 'unsaved'
  const pasted =
    unsaved || Boolean(unavailableName) || Boolean(pasteId) || isNativeChatPastedTextPath(path)
  const label = unavailableName
    ? t('components.native-chat.composer.pasteAttachAgainName', '{{name}}', {
        name: unavailableName
      })
    : unsaved
      ? t('components.native-chat.composer.pasteNotSavedLabel', 'Paste not saved')
      : pasted
        ? nativeChatPastedTextLabel(t)
        : basename(path)
  const pill = (
    <NativeChatPromptPill
      icon={
        unsaved || unavailableName ? FileX : state === 'saving' ? Hourglass : getFileTypeIcon(path)
      }
      label={label}
      // A paste's own label ("Pasted text") already says what it is.
      spokenLabel={
        unsaved || unavailableName
          ? t(
              'components.native-chat.composer.pasteAttachAgainNotice',
              'Paste not saved. Paste it again to send.'
            )
          : pasted
            ? undefined
            : t('components.native-chat.composer.filePillLabel', 'File: {{name}}', { name: label })
      }
      selected={selected}
      title={unsaved || unavailableName ? nativeChatPasteNotSavedNotice(t) : path || undefined}
      data-native-chat-file-reference={path}
      data-native-chat-file-unavailable={unavailableName ? true : undefined}
    />
  )
  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      {canOpen ? (
        <button
          type="button"
          className="inline max-w-full cursor-pointer text-left"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => open(path, live?.scopeKey === scope ? live.text : undefined)}
        >
          {pill}
        </button>
      ) : (
        pill
      )}
    </NodeViewWrapper>
  )
}
