import { useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Ban, CheckCircle2, ChevronDown, CircleDot, LoaderCircle, XCircle } from 'lucide-react'
import { cnbStateLabel, cnbStateTone } from '../cnb-task-row-model'
import type { CnbIssueStateReason, CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import type { CnbRowWriteRunner } from './use-cnb-row-writes'

/**
 * Inline status trigger. Issues offer close reasons (completed / not planned — CNB has no
 * `duplicate` state_reason); PRs only open/close, and a merged/closed PR is a plain label.
 */
export function CnbStatusCell({
  row,
  kind,
  writer
}: {
  row: CnbTaskRow
  kind: 'issues' | 'pull-requests'
  writer: CnbRowWriteRunner
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const isIssue = kind === 'issues'
  const label = cnbStateLabel(row, t)

  const setState = async (
    state: 'open' | 'closed',
    stateReason?: CnbIssueStateReason
  ): Promise<void> => {
    setOpen(false)
    const failure = isIssue
      ? t('cnb.tasks.stateUpdateFailed', 'Failed to update issue status.')
      : t('cnb.tasks.stateUpdateFailedPull', 'Failed to update pull request status.')
    if (isIssue) {
      await writer.runIssue(
        row,
        { action: 'update', state, ...(stateReason ? { stateReason } : {}) },
        failure
      )
      return
    }
    await writer.runPull(row, { action: 'update', state }, failure)
  }

  const triggerClass = cnbStateTone(row.state)
  if (!isIssue && row.state === 'merged') {
    // A merged PR is final; keep the unchanged label and tone with no action.
    return <span className={cn('text-xs font-medium', triggerClass)}>{label}</span>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={writer.pending}
          data-cnb-status-trigger
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={t('cnb.tasks.changeState', 'Change status: {{state}}', { state: label })}
          className={cn(
            'inline-flex max-w-full items-center gap-1 rounded-full border border-transparent px-1.5 py-0.5 text-xs font-medium transition hover:border-border/60 hover:bg-accent',
            triggerClass
          )}
        >
          {writer.pending ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : null}
          <span className="truncate">{label}</span>
          <ChevronDown className="size-2.5 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        tone="menu"
        className="w-56"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => void setState('open')}
          className={cn(
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent',
            row.state === 'open' && 'bg-accent/50'
          )}
        >
          <CircleDot className="size-4 text-muted-foreground" aria-hidden />
          {t('cnb.tasks.stateOpen', 'Open')}
        </button>
        {isIssue ? (
          <>
            <button
              type="button"
              onClick={() => void setState('closed', 'completed')}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent"
            >
              <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden />
              {t('cnb.tasks.closeAsCompleted', 'Close as completed')}
            </button>
            <button
              type="button"
              onClick={() => void setState('closed', 'not_planned')}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent"
            >
              <Ban className="size-4 text-muted-foreground" aria-hidden />
              {t('cnb.tasks.closeAsNotPlanned', 'Close as not planned')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void setState('closed')}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent"
          >
            <XCircle className="size-4 text-muted-foreground" aria-hidden />
            {t('cnb.tasks.closePull', 'Close pull request')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
