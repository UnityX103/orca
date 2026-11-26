import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  CircleDot,
  ExternalLink,
  GitPullRequest,
  GitPullRequestDraft,
  RefreshCw
} from 'lucide-react'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import {
  cnbChecksLabel,
  cnbChecksTone,
  cnbReviewerSummary,
  cnbRowKey,
  cnbStateLabel,
  cnbStateTone,
  cnbTaskGrid
} from './cnb-task-row-model'
import type { CnbTaskKind, CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'

export function CnbTaskTable({
  kind,
  rows,
  showRepo,
  onOpen,
  onStartWorkspace
}: {
  kind: CnbTaskKind
  rows: CnbTaskRow[]
  showRepo: boolean
  onOpen: (row: CnbTaskRow) => void
  onStartWorkspace: (row: CnbTaskRow) => void
}): React.JSX.Element {
  const t = useTranslate()
  const grid = cnbTaskGrid(kind)
  return (
    <div className="divide-y divide-border/40">
      {rows.map((row) => {
        const stateLabel = cnbStateLabel(row, t)
        const checksLabel = kind === 'pull-requests' ? cnbChecksLabel(row.checks, t) : null
        return (
          <div
            key={cnbRowKey(row)}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(row)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpen(row)
              }
            }}
            className={cn(
              'group grid min-h-12 cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              grid
            )}
          >
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              {kind === 'issues' ? (
                <CircleDot className="size-3" aria-hidden />
              ) : row.isDraft ? (
                <GitPullRequestDraft className="size-3" aria-hidden />
              ) : (
                <GitPullRequest className="size-3" aria-hidden />
              )}
              <span className="font-mono text-[11px]">#{row.number}</span>
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {row.title}
                </span>
                {showRepo ? (
                  <span className="shrink-0 rounded-full border border-border/50 bg-muted/40 px-1.5 text-[10px] text-muted-foreground">
                    {row.repoSlug}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {row.author ? <span>{row.author}</span> : null}
                {row.labels.slice(0, 3).map((label) => (
                  <span
                    key={label.name}
                    className="rounded-full border border-border/40 bg-muted/30 px-1.5 text-[10px]"
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {kind === 'issues'
                ? row.assignees.length > 0
                  ? row.assignees.join(', ')
                  : t('cnb.tasks.unassigned', 'Unassigned')
                : row.reviewers.length > 0
                  ? row.reviewers
                      .slice(0, 2)
                      .map((reviewer) => cnbReviewerSummary(reviewer.login, reviewer.reviewState))
                      .join(', ')
                  : t('cnb.tasks.noReviewers', 'No reviewers')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={cn('text-xs font-medium', cnbStateTone(row.state))}>
                {stateLabel}
              </span>
              {checksLabel ? (
                <span className={cn('text-[11px] font-medium', cnbChecksTone(row.checks))}>
                  {checksLabel}
                </span>
              ) : null}
            </span>
            <span className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-muted-foreground">
                {row.updatedAt ? formatUiRelativeTimeFromDate(row.updatedAt) : ''}
              </span>
              <span className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={(event) => {
                    event.stopPropagation()
                    onStartWorkspace(row)
                  }}
                  aria-label={t('cnb.tasks.startWorkspace', 'Start workspace from #{{number}}', {
                    number: row.number
                  })}
                >
                  <ArrowRight className="size-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={(event) => {
                    event.stopPropagation()
                    openAppHttpLink(row.url, { event })
                  }}
                  aria-label={t('cnb.tasks.openInBrowser', 'Open in browser')}
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                </Button>
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function CnbSkeletonRows({ kind }: { kind: CnbTaskKind }): React.JSX.Element {
  const grid = cnbTaskGrid(kind)
  return (
    <div className="divide-y divide-border/40">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className={cn('grid min-h-12 items-center gap-3 px-3 py-2', grid)}>
          <div className="h-4 w-12 animate-pulse rounded bg-muted/70" />
          <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted/70" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-14 animate-pulse rounded-full bg-muted/70" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
        </div>
      ))}
    </div>
  )
}

export function CnbRetryRow({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <span>{message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
        {t('cnb.tasks.retry', 'Try again')}
      </Button>
    </div>
  )
}
