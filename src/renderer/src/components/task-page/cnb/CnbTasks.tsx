import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { openAppHttpLinkFromAnchor } from '@/lib/browser/navigation/app-http-link-open'
import { useAppStore } from '@/store/index'
import { INTEGRATION_SETTING_TARGET_IDS } from '@/components/settings/integrations/integrations-search'
import type {
  CnbTaskKind,
  CnbTaskPage,
  CnbTaskRepository
} from '../../../../../shared/cnb/cnb-tasks'
import type { PreloadApi } from '../../../../../preload/api-types'

type CnbApi = NonNullable<PreloadApi['cnb']>
type RepositoryResult = Awaited<ReturnType<CnbApi['taskRepositories']>>

export function CnbTasks({ preferredRepoId }: { preferredRepoId?: string }): React.JSX.Element {
  const t = useTranslate()
  const api = window.api.cnb
  const [repoId, setRepoId] = useState<string | null>(null)
  const [kind, setKind] = useState<CnbTaskKind>('issues')
  const [revision, setRevision] = useState(0)
  const [latest, setLatest] = useState<{ revision: number; result: RepositoryResult | null }>()
  const result = latest?.revision === revision ? latest.result : undefined

  useEffect(() => {
    if (!api) {
      return
    }
    let active = true
    void api.taskRepositories().then(
      (next) => {
        if (active) {
          setLatest({ revision, result: next })
        }
      },
      () => {
        if (active) {
          setLatest({ revision, result: null })
        }
      }
    )
    return () => {
      active = false
    }
  }, [api, revision])

  const repositories = result?.repositories ?? []
  const repository =
    repositories.find((entry) => entry.id === repoId) ??
    repositories.find((entry) => entry.id === preferredRepoId) ??
    repositories[0]
  const refresh = (): void => setRevision((current) => current + 1)
  const repoLabel = t('cnb.tasks.repository', 'CNB repository')
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-2 pt-2"
      aria-label={t('cnb.tasks.source', 'CNB')}
    >
      {api && repository && (
        <div className="flex flex-wrap items-center gap-2">
          {repositories.length > 1 ? (
            <Select value={repository.id} onValueChange={setRepoId}>
              <SelectTrigger aria-label={repoLabel} className="h-8 max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              className="max-w-full truncate text-sm text-muted-foreground"
              title={repository.slug}
            >
              {repository.slug}
            </span>
          )}
          <div
            className="flex gap-1"
            role="group"
            aria-label={t('cnb.tasks.view', 'CNB task type')}
          >
            <Button
              size="sm"
              variant={kind === 'issues' ? 'secondary' : 'ghost'}
              aria-pressed={kind === 'issues'}
              onClick={() => setKind('issues')}
            >
              {t('cnb.tasks.issues', 'Issues')}
            </Button>
            <Button
              size="sm"
              variant={kind === 'merged-prs' ? 'secondary' : 'ghost'}
              aria-pressed={kind === 'merged-prs'}
              onClick={() => setKind('merged-prs')}
            >
              {t('cnb.tasks.mergedPrs', 'Merged PRs')}
            </Button>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t('cnb.tasks.refresh', 'Refresh CNB tasks')}
            onClick={refresh}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      )}
      {result?.incomplete && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('cnb.tasks.incomplete', 'Some projects could not be checked for a CNB remote.')}
        </p>
      )}
      {api && repository ? (
        <CnbTaskList
          key={`${repository.id}:${kind}:${revision}`}
          api={api}
          repository={repository}
          kind={kind}
        />
      ) : (
        <div role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          {!api ? t('cnb.tasks.unavailable', 'CNB tasks are available in the desktop app.') : null}
          {api && result === undefined && (
            <>
              <LoadingSpinner className="size-4" />
              {t('cnb.tasks.loading', 'Loading CNB tasks…')}
            </>
          )}
          {result === null &&
            t('cnb.tasks.repositoryError', 'Could not read CNB repository remotes.')}
          {result &&
            t('cnb.tasks.noRepositories', 'Add a Git project with a CNB remote to view its tasks.')}
          {api && result !== undefined && (
            <Button size="sm" variant="outline" onClick={refresh}>
              {t('cnb.tasks.retry', 'Try again')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

function CnbTaskList({
  api,
  repository,
  kind
}: {
  api: CnbApi
  repository: CnbTaskRepository
  kind: CnbTaskKind
}): React.JSX.Element {
  const t = useTranslate()
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [latest, setLatest] = useState<{ page: number; retry: number; result: CnbTaskPage }>()
  const result = latest?.page === page && latest.retry === retry ? latest.result : undefined

  useEffect(() => {
    let active = true
    const settle = (next: CnbTaskPage): void => {
      if (active) {
        setLatest({ page, retry, result: next })
      }
    }
    void api
      .taskPage({ repoId: repository.id, kind, page })
      .then(settle, () => settle({ ok: false, reason: 'request-failed' }))
    return () => {
      active = false
    }
  }, [api, kind, page, repository.id, retry])

  if (!result) {
    return (
      <div role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <LoadingSpinner className="size-4" />
        {t('cnb.tasks.loading', 'Loading CNB tasks…')}
      </div>
    )
  }
  if (!result.ok) {
    const connect = result.reason === 'not-connected'
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 py-3 text-sm text-muted-foreground"
      >
        {connect
          ? t('cnb.tasks.connect', 'Connect CNB in Integrations to browse repository tasks.')
          : result.reason === 'repository-unavailable'
            ? t('cnb.tasks.repositoryError', 'Could not read CNB repository remotes.')
            : t(
                'cnb.tasks.requestError',
                'Could not load tasks. Check the CNB connection and repository access.'
              )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (connect) {
              const { openSettingsPage, openSettingsTarget } = useAppStore.getState()
              openSettingsPage()
              openSettingsTarget({
                pane: 'integrations',
                repoId: null,
                sectionId: INTEGRATION_SETTING_TARGET_IDS.cnb
              })
            } else {
              setRetry((current) => current + 1)
            }
          }}
        >
          {connect
            ? t('cnb.tasks.openIntegrations', 'Open Integrations')
            : t('cnb.tasks.retry', 'Try again')}
        </Button>
      </div>
    )
  }

  const labels = {
    open: t('auto.components.TaskPage.606a85c774', 'Open'),
    closed: t('auto.components.TaskPage.d09bf34db7', 'Closed'),
    merged: t('cnb.tasks.merged', 'Merged')
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {result.items.length ? (
        <ul className="scrollbar-sleek min-h-0 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/50">
          {result.items.map((item) => (
            <li key={item.number}>
              <a
                className="flex min-h-10 items-center gap-3 px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
                href={item.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => openAppHttpLinkFromAnchor(event)}
              >
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  #{item.number}
                </span>
                <span className="min-w-0 flex-1 truncate" title={item.title}>
                  {item.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{labels[item.state]}</span>
                {item.updatedAt && (
                  <time
                    className="hidden shrink-0 text-xs text-muted-foreground sm:block"
                    dateTime={item.updatedAt}
                  >
                    {formatUiRelativeTimeFromDate(item.updatedAt)}
                  </time>
                )}
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="py-3 text-sm text-muted-foreground">
          {kind === 'issues'
            ? t('cnb.tasks.noIssues', 'No issues on this page.')
            : t('cnb.tasks.noMergedPrs', 'No merged pull requests on this page.')}
        </p>
      )}
      {(page > 1 || result.hasNextPage) && (
        <nav
          className="flex shrink-0 items-center justify-end gap-2"
          aria-label={t('cnb.tasks.pagination', 'CNB task pages')}
        >
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            {t('cnb.tasks.previous', 'Previous')}
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('cnb.tasks.page', 'Page {{page}}', { page })}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!result.hasNextPage}
            onClick={() => setPage(page + 1)}
          >
            {t('cnb.tasks.next', 'Next')}
          </Button>
        </nav>
      )}
    </div>
  )
}
