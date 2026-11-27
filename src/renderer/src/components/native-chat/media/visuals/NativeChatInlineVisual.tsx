import { useAppStore } from '@/store/index'
import { captureLinkOpenIntent } from '@/lib/links/placement/link-open-intent'
import { beginLinkOpenRequest } from '@/lib/links/link-open-request'
import { useContext, useEffect, useRef, useState } from 'react'
import { Download, SquareArrowOutUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { ArtifactPublishButton } from '@/components/artifacts/ArtifactPublishButton'
import { ArtifactPublishPreparationError } from '@/components/artifacts/artifact-publish-flow'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { fileArtifactSourceKey } from '@/lib/files/artifacts/file-artifact-source-key'
import { openFileInBrowserTab } from '@/lib/browser/documents/file-preview'
import { basename } from '@/lib/path'
import {
  getRuntimeTargetHostId,
  runtimeTargetEnvironmentId
} from '@/runtime/rpc/targets/runtime-client-target'
import { NATIVE_CHAT_VISUAL_RESERVED_HEIGHT, NativeChatVisualFrame } from './NativeChatVisualFrame'
import { observeTranscriptVisibility } from '../images/native-chat-image-visibility'
import { NativeChatForwardedGestureContext } from '../../viewport/scroll/native-chat-reader-scroll-input'
import { readNativeChatVisual } from './native-chat-visual-read-client'
import { useNativeChatVisualDocument } from './use-native-chat-visual-document'
import type { AgentSessionVisualReadError } from '../../../../../../shared/rpc-contract/structured-agent-session/agent-session-visual-params'
import type { ArtifactWriteRequest } from '../../../../../../shared/artifacts/artifacts'
import type { NativeChatVisualOwner } from './native-chat-visual-owner'

/** Cap the wide surface at 1024px (Codex's contract) and centre it in the transcript column. */
const WIDE_MAX_WIDTH_PX = 1024

/** Why a read produced nothing the reader can see, in their words. */
function unavailableReasonText(
  t: ReturnType<typeof useTranslate>,
  reason: AgentSessionVisualReadError | 'unavailable'
): string {
  switch (reason) {
    case 'not_found':
      return t(
        'components.native-chat.visualErrorNotFound',
        'The visualization file no longer exists.'
      )
    case 'too_large':
      return t(
        'components.native-chat.visualErrorTooLarge',
        'The visualization file is too large to show here.'
      )
    case 'not_text':
      return t(
        'components.native-chat.visualErrorNotText',
        'The visualization file is not readable text.'
      )
    case 'outside_folder':
      return t(
        'components.native-chat.visualErrorOutsideFolder',
        'The visualization file is outside this chat’s workspace.'
      )
    case 'not_a_file':
      return t(
        'components.native-chat.visualErrorNotAFile',
        'The visualization path is not a regular file.'
      )
    case 'unsupported_location':
      return t(
        'components.native-chat.visualErrorUnsupportedHost',
        'This chat’s files can’t be read on this device.'
      )
    case 'session_not_found':
    case 'unavailable':
      return t(
        'components.native-chat.visualErrorUnreachable',
        'The visualization couldn’t be loaded from its host.'
      )
  }
}

/** Opens the visual like any HTML file of the chat's workspace: rendered, its source a click away. */
function openNativeChatVisualFile(owner: NativeChatVisualOwner, path: string): void {
  const isCurrentRequest = beginLinkOpenRequest()
  const linkIntent = captureLinkOpenIntent(useAppStore.getState(), owner.worktreeId, owner.tabId)
  const plan = openFileInBrowserTab({
    filePath: path,
    worktreeId: owner.worktreeId,
    ...(owner.tabId ? { linkContext: { linkIntent, isCurrentRequest } } : {})
  })
  if (plan.status === 'unsupported') {
    toast.error(plan.message)
  }
}

/** Save the shown HTML to a file the reader picks; the frame's own document is the copy on screen. */
async function saveNativeChatVisualHtml(
  html: string,
  fileName: string,
  failureMessage: string
): Promise<void> {
  try {
    const result = await window.api.fs.saveDownloadedFile({
      suggestedName: fileName,
      content: html,
      encoding: 'utf8'
    })
    if (!result.canceled) {
      toast.success(fileName)
    }
  } catch {
    // A paired web client has no local filesystem to save into.
    toast.error(failureMessage)
  }
}

/** The file's own key on the chat's host, so Share here and on the opened file update one link. */
function nativeChatVisualShareKey(owner: NativeChatVisualOwner, path: string): string {
  return fileArtifactSourceKey(
    {
      executionHostId: getRuntimeTargetHostId(owner.target),
      runtimeEnvironmentId: runtimeTargetEnvironmentId(owner.target)
    },
    path
  )
}

/** Publishes the file as saved now, never the copy on screen; a failed read publishes nothing. */
async function readNativeChatVisualShareRequest(
  owner: NativeChatVisualOwner,
  identity: SharedReadIdentity
): Promise<ArtifactWriteRequest> {
  const { target, sessionId } = owner
  const outcome = await readNativeChatVisual(
    { target, sessionId, file: identity.file, path: identity.path },
    { fresh: true }
  )
  if (!outcome.ok) {
    throw new ArtifactPublishPreparationError('visual-unreadable')
  }
  return {
    sourceKey: nativeChatVisualShareKey(owner, outcome.document.path),
    content: outcome.document.html,
    contentType: 'text/html',
    fileName: basename(outcome.document.path)
  }
}

type SharedReadIdentity = { file: string | null; path: string | null }

/** Mount near the viewport, then keep the frame mounted so interactive state survives scrolling away. */
export function NativeChatInlineVisual({
  owner,
  file,
  path,
  wide,
  title
}: {
  owner: NativeChatVisualOwner
  file: string | null
  path: string | null
  wide: boolean
  title: string | null
}): React.JSX.Element {
  const t = useTranslate()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(false)
  const [retired, setRetired] = useState(false)
  // Share's popover is portalled, so hover and focus-within can't keep the toolbar shown.
  const [shareOpen, setShareOpen] = useState(false)
  const forwardGesture = useContext(NativeChatForwardedGestureContext)
  const identity = { file, path }
  const state = useNativeChatVisualDocument(
    { target: owner.target, sessionId: owner.sessionId, file, path },
    near
  )
  // The last document we rendered, so a retired frame can still be saved even after it goes blank.
  const [lastDocument, setLastDocument] = useState<{ html: string; path: string } | null>(null)
  const readyDocument = state.status === 'ready' ? state.document : null
  useEffect(() => {
    if (readyDocument) {
      setLastDocument(readyDocument)
    }
  }, [readyDocument])

  useEffect(() => {
    const element = boxRef.current
    if (!element || near) {
      return
    }
    return observeTranscriptVisibility(element, (visible) => {
      if (visible) {
        setNear(true)
      }
    })
  }, [near])

  const label = title ?? file ?? (path ? basename(path) : '')
  const openLabel = t('components.native-chat.visualOpenInNewTab', 'Open in new tab')
  const saveLabel = t('components.native-chat.visualSaveHtml', 'Save HTML')
  const saveFailed = t(
    'components.native-chat.visualSaveUnavailable',
    'Saving isn’t available here.'
  )
  const style = wide ? { maxWidth: WIDE_MAX_WIDTH_PX } : undefined
  const reason: AgentSessionVisualReadError | 'unavailable' | null = retired
    ? 'unavailable'
    : state.status === 'unavailable'
      ? state.reason
      : null

  if (reason !== null) {
    const saved = lastDocument
    return (
      <NativeChatVisualUnavailable
        reason={reason}
        actions={
          <>
            {path ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => openNativeChatVisualFile(owner, saved?.path ?? path)}
              >
                {openLabel}
              </Button>
            ) : null}
            {saved ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => void saveNativeChatVisualHtml(saved.html, label, saveFailed)}
              >
                {saveLabel}
              </Button>
            ) : null}
          </>
        }
      />
    )
  }

  return (
    <div ref={boxRef} className="group/visual my-3 last:mb-0" style={style}>
      {state.status === 'ready' && near ? (
        <>
          {/* Above the frame, not over it: the page owns every pixel of its box. */}
          <div
            data-share-open={shareOpen}
            className="flex items-center justify-end gap-1 pb-1 transition-opacity can-hover:opacity-0 group-hover/visual:opacity-100 focus-within:opacity-100 data-[share-open=true]:opacity-100"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label={openLabel}
                  onClick={() => openNativeChatVisualFile(owner, state.document.path)}
                >
                  <SquareArrowOutUpRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {openLabel}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label={saveLabel}
                  onClick={() =>
                    void saveNativeChatVisualHtml(state.document.html, label, saveFailed)
                  }
                >
                  <Download />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {saveLabel}
              </TooltipContent>
            </Tooltip>
            <ArtifactPublishButton
              variant="outline"
              size="icon-xs"
              sourceKey={nativeChatVisualShareKey(owner, state.document.path)}
              createRequest={() => readNativeChatVisualShareRequest(owner, identity)}
              open={shareOpen}
              onOpenChange={setShareOpen}
            />
          </div>
          <NativeChatVisualFrame
            document={state.document}
            title={label}
            themeScope={boxRef}
            onRetired={() => setRetired(true)}
            onReaderGesture={forwardGesture ?? undefined}
          />
        </>
      ) : (
        <div
          role="status"
          aria-label={t('components.native-chat.visualLoading', 'Loading visualization')}
          className="w-full rounded-md bg-muted/30"
          style={{ height: NATIVE_CHAT_VISUAL_RESERVED_HEIGHT }}
        />
      )}
    </div>
  )
}

/** A visual that produced nothing to show: why, plus whatever recovery the caller can offer. */
export function NativeChatVisualUnavailable({
  reason,
  actions
}: {
  reason?: AgentSessionVisualReadError | 'unavailable'
  actions?: React.ReactNode
} = {}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="my-2 flex flex-col gap-1.5 text-xs text-chat-foreground-faint last:mb-0">
      <span>
        {reason
          ? unavailableReasonText(t, reason)
          : t('components.native-chat.visualUnavailable', 'Visualization unavailable')}
      </span>
      {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}
