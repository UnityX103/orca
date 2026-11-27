import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { cnbTaskGrid } from './cnb-task-row-model'
import { CnbTaskRowView } from './rows/CnbTaskRowView'
import type { PreloadApi } from '../../../../../preload/api-types'
import type { CnbTaskKind, CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

export function CnbTaskTable({
  kind,
  rows,
  showRepo,
  api,
  isWorkspaceAttached,
  onOpen,
  onOpenPullChecks,
  onStartWorkspace,
  onUseNewWorkspace,
  onChanged
}: {
  kind: CnbTaskKind
  rows: CnbTaskRow[]
  showRepo: boolean
  api: CnbApi | undefined
  isWorkspaceAttached: (row: CnbTaskRow) => boolean
  onOpen: (row: CnbTaskRow) => void
  onOpenPullChecks: (row: CnbTaskRow) => void
  onStartWorkspace: (row: CnbTaskRow) => void
  onUseNewWorkspace: (row: CnbTaskRow) => void
  onChanged: () => void
}): React.JSX.Element {
  return (
    <div className="divide-y divide-border/40">
      {rows.map((row) => (
        <CnbTaskRowView
          key={`${row.repoId}:${row.repoSlug}:${row.number}`}
          row={row}
          kind={kind}
          showRepo={showRepo}
          api={api}
          attachedWorkspace={isWorkspaceAttached(row)}
          onOpen={onOpen}
          onOpenPullChecks={onOpenPullChecks}
          onStartWorkspace={onStartWorkspace}
          onUseNewWorkspace={onUseNewWorkspace}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}

export function CnbSkeletonRows({ kind }: { kind: CnbTaskKind }): React.JSX.Element {
  const grid = cnbTaskGrid(kind)
  const columns =
    kind === 'issues'
      ? ['w-12', 'w-3/5', 'w-16', 'w-14', 'w-12', 'w-4']
      : ['w-12', 'w-3/5', 'w-16', 'w-12', 'w-14', 'w-12', 'w-12', 'w-4']
  return (
    <div className="divide-y divide-border/40">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className={cn('grid min-h-12 items-center gap-3 px-3 py-2', grid)}>
          {columns.map((width, columnIndex) => (
            <div
              key={columnIndex}
              className={cn('h-3.5 animate-pulse rounded bg-muted/70', width)}
            />
          ))}
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
