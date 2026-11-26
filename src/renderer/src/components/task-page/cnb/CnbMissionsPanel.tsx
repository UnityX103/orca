import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { cn } from '@/lib/class-names'
import type {
  CnbMission,
  CnbMissionField,
  CnbMissionResource,
  CnbMissionView
} from '../../../../../shared/cnb/cnb-tasks'
import type { CnbMissionState } from './use-cnb-task-list'

const VIEW_TYPE_LABEL: Record<CnbMissionView['type'], string> = {
  table: 'Table',
  board: 'Board',
  gantt: 'Gantt'
}

export function CnbMissionsPanel({
  state,
  missions,
  views,
  fields,
  selectedViewId,
  resources,
  onSelectMission,
  onSelectView,
  onLoadMore,
  onRetry,
  onOpenResource
}: {
  state: CnbMissionState
  missions: CnbMission[]
  views: CnbMissionView[]
  fields: CnbMissionField[]
  selectedViewId: string | null
  resources: CnbMissionResource[]
  onSelectMission: (path: string) => void
  onSelectView: (viewId: string) => void
  onLoadMore: () => void
  onRetry: () => void
  onOpenResource: (resource: CnbMissionResource) => void
}): React.JSX.Element {
  const t = useTranslate()

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-md border border-border/50 px-4 py-4 text-sm text-muted-foreground"
      >
        <LoaderCircle className="size-4 animate-spin" />
        {t('cnb.tasks.loadingMissions', 'Loading CNB missions…')}
      </div>
    )
  }

  if (state.status === 'forbidden') {
    return (
      <div className="rounded-md border border-border/60 bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
        {t(
          'cnb.tasks.missionsForbidden',
          'This CNB token cannot list missions. Grant group-resource read permission (group-resource:r), or browse Issues and Pull requests instead.'
        )}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <span>
          {state.reason === 'not-connected'
            ? t('cnb.tasks.connect', 'Connect CNB in Integrations to browse repository tasks.')
            : t('cnb.tasks.requestError', 'Could not load tasks. Check the CNB connection.')}
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('cnb.tasks.retry', 'Try again')}
        </Button>
      </div>
    )
  }

  const ready = state.status === 'ready' ? state : null
  const selectedPath = ready?.selectedPath ?? null
  const resourcesError = ready?.resourcesError ?? null
  const hasNext = Boolean(ready?.nextCursor)

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
      {missions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 bg-muted/30 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {t('cnb.tasks.missions', 'Missions')}
          </span>
          {missions.map((mission) => {
            const active = mission.path === selectedPath
            return (
              <button
                key={mission.path}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectMission(mission.path)}
                title={mission.path}
                className={
                  active
                    ? 'rounded-md border border-border/50 bg-foreground/90 px-2 py-0.5 text-xs font-medium text-background'
                    : 'rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs text-foreground hover:bg-muted/60'
                }
              >
                {mission.name}
              </button>
            )
          })}
        </div>
      ) : (
        <p
          role="status"
          className="border-b border-border/50 px-4 py-3 text-sm text-muted-foreground"
        >
          {t(
            'cnb.tasks.noMissions',
            'No missions are visible to this CNB account in the selected organizations.'
          )}
        </p>
      )}

      {views.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {t('cnb.tasks.views', 'Views')}
          </span>
          {views.map((view) => {
            const active = view.id === selectedViewId
            return (
              <button
                key={view.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectView(view.id)}
                title={VIEW_TYPE_LABEL[view.type]}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] transition',
                  active
                    ? 'border-border/50 bg-foreground/90 text-background'
                    : 'border-border/60 bg-background text-foreground hover:bg-muted/60'
                )}
              >
                {view.name}
                <span className="ml-1 text-[9px] uppercase opacity-70">
                  {VIEW_TYPE_LABEL[view.type]}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {fields.length > 0 ? (
        <p className="border-b border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
          {t('cnb.tasks.missionFields', 'Fields: {{fields}}', {
            fields: fields.map((field) => field.name).join(', ')
          })}
        </p>
      ) : null}

      {resourcesError ? (
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <span>
            {resourcesError === 'forbidden'
              ? t(
                  'cnb.tasks.missionResourcesForbidden',
                  'This CNB token cannot read mission resources (needs mission-manage:r). Mission views and field metadata still show above.'
                )
              : t(
                  'cnb.tasks.missionResourcesError',
                  'Could not load mission resources. Mission views and field metadata still show above.'
                )}
          </span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('cnb.tasks.retry', 'Try again')}
          </Button>
        </div>
      ) : null}

      {missions.length > 0 && !resourcesError && resources.length === 0 ? (
        <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">
          {t(
            'cnb.tasks.noMissionResources',
            'This mission has no matching issues or pull requests.'
          )}
        </p>
      ) : null}

      {resources.length > 0 ? (
        <ul className="scrollbar-sleek min-h-0 flex-initial divide-y divide-border/40 overflow-y-auto">
          {resources.map((resource) => (
            <li key={`${resource.repoSlug}:${resource.kind}:${resource.number}`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenResource(resource)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenResource(resource)
                  }
                }}
                className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm hover:bg-accent"
              >
                <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">
                  {resource.kind === 'issue' ? '#' : '!'}
                  {resource.number}
                </span>
                <span className="min-w-0 flex-1 truncate" title={resource.title}>
                  {resource.title}
                </span>
                {resource.priority ? (
                  <span className="shrink-0 rounded border border-border/50 px-1 text-[10px] text-muted-foreground">
                    {resource.priority}
                  </span>
                ) : null}
                {resource.labels.slice(0, 2).map((label) => (
                  <span
                    key={label.name}
                    className="shrink-0 rounded-full border border-border/40 bg-muted/30 px-1.5 text-[10px] text-muted-foreground"
                  >
                    {label.name}
                  </span>
                ))}
                <span className="shrink-0 rounded-full border border-border/50 bg-muted/40 px-1.5 text-[10px] text-muted-foreground">
                  {resource.repoSlug}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {resource.updatedAt ? formatUiRelativeTimeFromDate(resource.updatedAt) : ''}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t('cnb.tasks.openInBrowser', 'Open in browser')}
                  onClick={(event) => {
                    event.stopPropagation()
                    openAppHttpLink(resource.url, { event })
                  }}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {hasNext ? (
        <div className="flex-none border-t border-border/50 p-2">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            {t('cnb.tasks.loadMore', 'Load more')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
