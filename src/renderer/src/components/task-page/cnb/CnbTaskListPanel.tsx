import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { PaginationBar } from '../PaginationBar'
import { CnbRetryRow, CnbSkeletonRows, CnbTaskTable } from './CnbTaskTable'
import { cnbTaskGrid } from './cnb-task-row-model'
import type { PreloadApi } from '../../../../../preload/api-types'
import type { CnbTaskKind, CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

export function CnbTaskListPanel({
  kind,
  rows,
  showRepo,
  api,
  loading,
  error,
  needsConnect,
  empty,
  scopeNotice,
  failures,
  page,
  pageCount,
  hasNextPage,
  isWorkspaceAttached,
  onPageChange,
  onOpen,
  onOpenPullChecks,
  onStartWorkspace,
  onUseNewWorkspace,
  onRetry,
  onOpenIntegrations,
  onChanged
}: {
  kind: CnbTaskKind
  rows: CnbTaskRow[]
  showRepo: boolean
  api: CnbApi | undefined
  loading: boolean
  error: string | null
  needsConnect: boolean
  empty: { title: string; description: string }
  scopeNotice: string | null
  failures: { key: string; message: string }[]
  page: number
  pageCount: number | null
  hasNextPage: boolean
  isWorkspaceAttached: (row: CnbTaskRow) => boolean
  onPageChange: (page: number) => void
  onOpen: (row: CnbTaskRow) => void
  onOpenPullChecks: (row: CnbTaskRow) => void
  onStartWorkspace: (row: CnbTaskRow) => void
  onUseNewWorkspace: (row: CnbTaskRow) => void
  onRetry: () => void
  onOpenIntegrations: () => void
  onChanged: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const grid = cnbTaskGrid(kind)
  const showEmpty = !loading && !error && rows.length === 0 && failures.length === 0
  return (
    <div className="flex min-h-0 min-w-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
      <div
        className="min-h-0 flex-initial overflow-auto scrollbar-sleek scrollbar-sleek-lg"
        style={{ scrollbarGutter: 'stable' }}
      >
        <div
          className={`sticky top-0 z-40 grid h-8 gap-3 border-b border-border/50 px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground [background:color-mix(in_srgb,var(--muted)_25%,var(--background))] [&>span]:flex [&>span]:items-center ${grid}`}
        >
          <span>{t('cnb.tasks.headerId', 'ID')}</span>
          <span>{t('cnb.tasks.headerTitle', 'Title / Context')}</span>
          {kind === 'issues' ? (
            <>
              <span>{t('cnb.tasks.headerAssignees', 'Assignees')}</span>
              <span>{t('cnb.tasks.headerStatus', 'Status')}</span>
            </>
          ) : (
            <>
              <span>{t('cnb.tasks.headerReviewers', 'Reviewers')}</span>
              <span>{t('cnb.tasks.headerChecks', 'Checks')}</span>
              <span>{t('cnb.tasks.headerMerge', 'Merge')}</span>
              <span>{t('cnb.tasks.headerStatus', 'Status')}</span>
            </>
          )}
          <span>{t('cnb.tasks.headerUpdated', 'Updated')}</span>
          <span aria-hidden />
        </div>

        {scopeNotice ? (
          <p
            role="status"
            className="border-b border-border/50 bg-muted/40 px-4 py-2 text-xs text-muted-foreground"
          >
            {scopeNotice}
          </p>
        ) : null}

        {error ? (
          <div
            role="alert"
            aria-atomic="true"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="size-3.5 flex-none" />
              {error}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={needsConnect ? onOpenIntegrations : onRetry}
            >
              {needsConnect
                ? t('cnb.tasks.openIntegrations', 'Open Integrations')
                : t('cnb.tasks.retry', 'Try again')}
            </Button>
          </div>
        ) : null}

        {failures.map((failure) => (
          <CnbRetryRow key={failure.key} message={failure.message} onRetry={onRetry} />
        ))}

        {loading ? <CnbSkeletonRows kind={kind} /> : null}

        {showEmpty ? (
          <div className="px-4 py-10 text-center">
            <p className="text-base font-medium text-foreground">{empty.title}</p>
            {empty.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{empty.description}</p>
            ) : null}
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <CnbTaskTable
            kind={kind}
            rows={rows}
            showRepo={showRepo}
            api={api}
            isWorkspaceAttached={isWorkspaceAttached}
            onOpen={onOpen}
            onOpenPullChecks={onOpenPullChecks}
            onStartWorkspace={onStartWorkspace}
            onUseNewWorkspace={onUseNewWorkspace}
            onChanged={onChanged}
          />
        ) : null}
      </div>

      {!loading && rows.length > 0 && (page > 1 || hasNextPage || (pageCount ?? 1) > 1) ? (
        <div className="flex-none border-t border-border/50 bg-background">
          <PaginationBar
            currentPage={page - 1}
            totalPages={pageCount ?? page - 1 + (hasNextPage ? 2 : 1)}
            loadingTarget={null}
            onPageChange={(next) => onPageChange(next + 1)}
          />
        </div>
      ) : null}
    </div>
  )
}
