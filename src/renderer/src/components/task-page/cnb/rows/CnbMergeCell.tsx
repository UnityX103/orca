import { useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { useConfirmationDialog } from '@/components/dismiss/confirmation/confirmation-dialog-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronDown, GitMerge, LoaderCircle } from 'lucide-react'
import { cnbMergeTone } from '../cnb-task-row-model'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import type { CnbRowWriteRunner } from './use-cnb-row-writes'

type MergeStyle = 'merge' | 'squash' | 'rebase'
const MERGE_STYLES: MergeStyle[] = ['merge', 'squash', 'rebase']

/**
 * Inline merge menu. The trigger is disabled with a reason whenever CNB reports the PR is not
 * mergeable, so an unmergeable row can never send a merge request.
 */
export function CnbMergeCell({
  row,
  writer
}: {
  row: CnbTaskRow
  writer: CnbRowWriteRunner
}): React.JSX.Element {
  const t = useTranslate()
  const confirm = useConfirmationDialog()
  const [open, setOpen] = useState(false)
  const merged = row.state === 'merged'
  const canMerge = row.state === 'open' && row.mergeable === 'MERGEABLE'
  const blockedReason =
    row.state !== 'open'
      ? t('cnb.tasks.mergeClosed', 'This pull request is not open.')
      : t('cnb.tasks.mergeBlocked', 'CNB reports this pull request cannot be merged yet.')

  const styleLabel = (style: MergeStyle): string =>
    style === 'squash'
      ? t('cnb.tasks.squash', 'Squash')
      : style === 'rebase'
        ? t('cnb.tasks.rebase', 'Rebase')
        : t('cnb.tasks.mergeCommit', 'Merge commit')

  const merge = async (style: MergeStyle): Promise<void> => {
    if (!canMerge || writer.pending) {
      return
    }
    const confirmed = await confirm({
      title: t('cnb.tasks.mergeConfirmTitle', 'Merge pull request #{{number}}?', {
        number: row.number
      }),
      description: t(
        'cnb.tasks.mergeConfirmBody',
        'This merges the pull request on CNB with “{{style}}”.',
        { style: styleLabel(style) }
      ),
      confirmLabel: t('cnb.tasks.merge', 'Merge')
    })
    if (!confirmed) {
      return
    }
    await writer.runPull(
      row,
      { action: 'merge', style, title: row.title, message: '' },
      t('cnb.tasks.mergeFailed', 'Failed to merge pull request.')
    )
  }

  const triggerClass = cnbMergeTone(row)

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={!canMerge || writer.pending}
              data-cnb-merge-trigger
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label={
                canMerge
                  ? t('cnb.tasks.mergeMenu', 'Merge pull request')
                  : `${t('cnb.tasks.merge', 'Merge')}: ${blockedReason}`
              }
              aria-disabled={!canMerge || writer.pending}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition enabled:hover:brightness-110 disabled:cursor-not-allowed',
                triggerClass
              )}
            >
              {writer.pending ? (
                <LoaderCircle className="size-3 animate-spin" aria-hidden />
              ) : (
                <GitMerge className="size-3" aria-hidden />
              )}
              <span className="truncate">
                {merged ? t('cnb.tasks.stateMerged', 'Merged') : t('cnb.tasks.merge', 'Merge')}
              </span>
              {canMerge ? <ChevronDown className="size-2.5 opacity-60" aria-hidden /> : null}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {canMerge ? t('cnb.tasks.mergeMenu', 'Merge pull request') : blockedReason}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
        {MERGE_STYLES.map((style) => (
          <DropdownMenuItem
            key={style}
            disabled={!canMerge || writer.pending}
            onSelect={() => {
              setOpen(false)
              void merge(style)
            }}
          >
            <GitMerge className="size-4" aria-hidden />
            {styleLabel(style)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
