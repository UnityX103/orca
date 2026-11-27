import { cn } from '@/lib/class-names'
import { CircleDot, GitPullRequest, GitPullRequestDraft } from 'lucide-react'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { useTranslate } from '@/i18n/use-translate'
import { cnbReviewerSummary, cnbTaskGrid } from '../cnb-task-row-model'
import { useCnbRowWrites } from './use-cnb-row-writes'
import { CnbStatusCell } from './CnbStatusCell'
import { CnbPeopleCell } from './CnbPeopleCell'
import { CnbLabelsCell } from './CnbLabelsCell'
import { CnbChecksCell } from './CnbChecksCell'
import { CnbMergeCell } from './CnbMergeCell'
import { CnbRowMenu } from './CnbRowMenu'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbTaskKind, CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

/**
 * One first-level list row, mirroring the GitHub rows: inline status, assignee/reviewer editor,
 * labels, and (for PRs) checks + merge, all acting without opening the detail panel.
 */
export function CnbTaskRowView({
  row,
  kind,
  showRepo,
  api,
  attachedWorkspace,
  onOpen,
  onOpenPullChecks,
  onStartWorkspace,
  onUseNewWorkspace,
  onChanged
}: {
  row: CnbTaskRow
  kind: CnbTaskKind
  showRepo: boolean
  api: CnbApi | undefined
  attachedWorkspace: boolean
  onOpen: (row: CnbTaskRow) => void
  /** Opens a PR detail on its Checks tab. */
  onOpenPullChecks: (row: CnbTaskRow) => void
  onStartWorkspace: (row: CnbTaskRow) => void
  onUseNewWorkspace: (row: CnbTaskRow) => void
  onChanged: () => void
}): React.JSX.Element {
  const isIssues = kind === 'issues'
  const t = useTranslate()
  const writer = useCnbRowWrites({ api, onChanged })
  const reviewerSummary =
    row.reviewers.length > 0
      ? row.reviewers
          .slice(0, 2)
          .map((reviewer) => cnbReviewerSummary(reviewer.login, reviewer.reviewState))
          .join(', ') + (row.reviewers.length > 2 ? ` +${row.reviewers.length - 2}` : '')
      : t('cnb.tasks.noReviewers', 'No reviewers')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        // Only the row itself opens on Enter/Space; child controls (status, checks, menu) keep
        // their own activation so a focused Checks button opens the Checks tab, not the row.
        if (event.target !== event.currentTarget) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(row)
        }
      }}
      className={cn(
        'group grid min-h-12 cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        cnbTaskGrid(kind)
      )}
    >
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {isIssues ? (
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
          <span className="truncate text-[13px] font-medium text-foreground">{row.title}</span>
          {showRepo ? (
            <span className="shrink-0 rounded-full border border-border/50 bg-muted/40 px-1.5 text-[10px] text-muted-foreground">
              {row.repoSlug}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          {row.author ? <span className="shrink-0">{row.author}</span> : null}
          <CnbLabelsCell api={api} row={row} kind={kind} writer={writer} />
        </div>
      </div>

      {isIssues ? (
        <>
          <div className="flex min-w-0 items-center">
            <CnbPeopleCell
              api={api}
              row={row}
              kind="issues"
              current={row.assignees}
              writer={writer}
            />
          </div>
          <div className="flex min-w-0 items-center">
            <CnbStatusCell row={row} kind="issues" writer={writer} />
          </div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 items-center">
            <CnbPeopleCell
              api={api}
              row={row}
              kind="pull-requests"
              current={row.reviewers.map((reviewer) => reviewer.login)}
              summaryText={reviewerSummary}
              writer={writer}
            />
          </div>
          <div className="flex min-w-0 items-center">
            <CnbChecksCell api={api} row={row} onOpenChecks={() => onOpenPullChecks(row)} />
          </div>
          <div className="flex min-w-0 items-center">
            <CnbMergeCell row={row} writer={writer} />
          </div>
          <div className="flex min-w-0 items-center">
            <CnbStatusCell row={row} kind="pull-requests" writer={writer} />
          </div>
        </>
      )}

      <div className="flex min-w-0 items-center">
        <span className="truncate text-[11px] text-muted-foreground">
          {row.updatedAt ? formatUiRelativeTimeFromDate(row.updatedAt) : ''}
        </span>
      </div>

      <div className="flex items-center justify-end">
        <CnbRowMenu
          row={row}
          attachedWorkspace={attachedWorkspace}
          onStartWorkspace={onStartWorkspace}
          onUseNewWorkspace={onUseNewWorkspace}
        />
      </div>
    </div>
  )
}
