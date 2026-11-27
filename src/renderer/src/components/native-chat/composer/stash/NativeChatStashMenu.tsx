import { useState } from 'react'
import { Bookmark, Paperclip, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslate } from '@/i18n/use-translate'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { NativeChatStashBadge } from './NativeChatStashBadge'
import type { StoredNativeChatStashEntry } from '../../drafts/native-chat-prompt-stash-storage'

const SNIPPET_MAX_CHARS = 90

/** A one-line summary of an entry: its text, else what it holds instead. */
export function nativeChatStashSnippet(
  entry: StoredNativeChatStashEntry,
  t: ReturnType<typeof useTranslate>
): string {
  const text = entry.draft.text.trim().replace(/\s+/g, ' ')
  if (text.length > 0) {
    if (text.length <= SNIPPET_MAX_CHARS) {
      return text
    }
    // Never end on half of a surrogate pair (a split emoji).
    const last = text.charCodeAt(SNIPPET_MAX_CHARS - 1)
    const end = last >= 0xd800 && last <= 0xdbff ? SNIPPET_MAX_CHARS - 1 : SNIPPET_MAX_CHARS
    return `${text.slice(0, end).trimEnd()}…`
  }
  const images = entry.draft.images.length
  const files = Object.keys(entry.draft.pastedTextFiles ?? {}).length
  const attachments = images + files
  if (attachments === 0) {
    return t('components.native-chat.stash.emptySnippet', '(empty)')
  }
  return t('components.native-chat.stash.attachmentSnippet', '({{count}} attachments)', {
    count: attachments,
    defaultValue_one: '({{count}} attachment)'
  })
}

/** Attachments the entry still references; a dropped image is already one of `images` (as a placeholder). */
function attachmentCount(entry: StoredNativeChatStashEntry): number {
  return entry.draft.images.length + Object.keys(entry.draft.pastedTextFiles ?? {}).length
}

/** Stashed drafts newest first: restore or delete each, with its summary, age and attachment count. */
export function NativeChatStashMenu({
  entries,
  pulseKey,
  open,
  disabled,
  onOpenChange,
  onRestore,
  onRemove
}: {
  entries: readonly StoredNativeChatStashEntry[]
  pulseKey: number
  open: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onRestore: (entry: StoredNativeChatStashEntry) => void
  onRemove: (entry: StoredNativeChatStashEntry) => void
}): React.JSX.Element | null {
  const t = useTranslate()
  // Ages are read once per mount, not per render, so the list does not re-time under React's purity checks.
  const [now] = useState(() => Date.now())
  if (entries.length === 0) {
    return null
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span className="inline-flex">
          <NativeChatStashBadge
            count={entries.length}
            menuOpen={open}
            pulseKey={pulseKey}
            disabled={disabled}
            onToggle={() => onOpenChange(!open)}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        tone="menu"
        className="w-80"
        aria-label={t('components.native-chat.stash.menuLabel', 'Stashed prompts')}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-1 p-1">
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Bookmark className="size-3" />
            {t('components.native-chat.stash.menuTitle', 'Stash')}
          </div>
          <ul className="scrollbar-sleek max-h-80 overflow-y-auto">
            {entries.map((entry) => {
              const snippet = nativeChatStashSnippet(entry, t)
              const attachments = attachmentCount(entry)
              return (
                <li key={entry.id} className="group/stash flex items-start gap-1">
                  <button
                    type="button"
                    data-stash-restore="true"
                    onClick={() => onRestore(entry)}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate text-xs text-popover-foreground">{snippet}</span>
                    <span className="flex items-center gap-2 text-2xs text-muted-foreground">
                      <span>{formatUiRelativeTime(entry.createdAt - now)}</span>
                      {attachments > 0 ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Paperclip className="size-3" />
                          {attachments}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('components.native-chat.stash.delete', 'Delete stashed prompt')}
                    className="mt-1 shrink-0"
                    onClick={() => onRemove(entry)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-1 px-2 pb-1 pt-0.5 text-2xs text-muted-foreground">
            <RotateCcw className="size-3" />
            {t('components.native-chat.stash.restoreHint', 'Restore appends after what you typed')}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
