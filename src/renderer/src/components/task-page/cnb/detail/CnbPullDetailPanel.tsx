import { useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, ArrowRight, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { CopyTextButton } from '@/components/clipboard/CopyTextButton'
import CommentMarkdown from '@/components/comment-markdown/CommentMarkdown'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbPullDetail, CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import { useCnbPullDetail, useCnbPullWriter } from '../use-cnb-task-detail'
import { CnbCommentComposer } from './CnbCommentComposer'
import { CnbPullBodyEditor } from './CnbPullBodyEditor'
import { CnbPullActions } from './CnbPullActions'
import { cnbReviewerSummary } from '../cnb-task-row-model'
import { CnbTaskDispatchSection } from '../dispatch/CnbTaskDispatchSection'

type CnbApi = NonNullable<PreloadApi['cnb']>

function stateLabel(detail: CnbPullDetail, t: ReturnType<typeof useTranslate>): string {
  if (detail.state === 'merged') {
    return t('cnb.tasks.stateMerged', 'Merged')
  }
  if (detail.state === 'closed') {
    return t('cnb.tasks.stateClosed', 'Closed')
  }
  return detail.isDraft ? t('cnb.tasks.stateDraft', 'Draft') : t('cnb.tasks.stateOpen', 'Open')
}

export function CnbPullDetailPanel({
  api,
  row,
  onBack,
  onChanged,
  onStartWorkspace
}: {
  api: CnbApi
  row: CnbTaskRow
  onBack: () => void
  onChanged: () => void
  onStartWorkspace: (row: CnbTaskRow) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [refreshNonce, setRefreshNonce] = useState(0)
  const state = useCnbPullDetail({ api, row, refreshNonce })
  const writer = useCnbPullWriter({
    api,
    row,
    onWritten: () => {
      setRefreshNonce((value) => value + 1)
      onChanged()
    }
  })
  const [error, setError] = useState<string | null>(null)
  const refresh = (): void => setRefreshNonce((value) => value + 1)
  const runWrite = async (payload: Parameters<typeof writer.submit>[0]): Promise<boolean> => {
    setError(null)
    const result = await writer.submit(payload)
    if (!result.ok) {
      setError(
        t('cnb.tasks.writeFailed', 'CNB rejected the change: {{reason}}', { reason: result.reason })
      )
      return false
    }
    return true
  }

  const detail = state.status === 'ready' ? state.detail : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t('cnb.tasks.backToList', 'Back to list')}
        </Button>
        <span className="font-mono text-xs text-muted-foreground">#{row.number}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {detail?.title ?? row.title}
        </span>
        <CopyTextButton text={row.url} label={t('cnb.tasks.copyLink', 'Copy link')} />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('cnb.tasks.openInBrowser', 'Open in browser')}
          onClick={(event) => openAppHttpLink(row.url, { event })}
        >
          <ExternalLink className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('cnb.tasks.refresh', 'Refresh CNB tasks')}
          onClick={refresh}
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button size="sm" onClick={() => onStartWorkspace(row)}>
          {t('cnb.tasks.startWorkspaceShort', 'Start workspace')}
          <ArrowRight className="size-3" />
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t('cnb.tasks.loadingPull', 'Loading pull request…')}
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
        >
          <span>
            {state.reason === 'not-found'
              ? t('cnb.tasks.notFoundPull', 'This pull request no longer exists.')
              : t('cnb.tasks.detailErrorPull', 'Could not load this pull request.')}
          </span>
          <Button variant="outline" size="sm" onClick={refresh}>
            {t('cnb.tasks.retry', 'Try again')}
          </Button>
        </div>
      ) : null}

      {detail ? (
        <>
          <CnbTaskDispatchSection api={api} row={row} onCreateWorkspace={onStartWorkspace} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={detail.state === 'open' ? 'default' : 'secondary'}>
              {stateLabel(detail, t)}
            </Badge>
            {detail.author ? <span>{detail.author}</span> : null}
            {detail.headRef && detail.baseRef ? (
              <span className="font-mono text-[11px]">
                {detail.headRef} → {detail.baseRef}
              </span>
            ) : null}
            {detail.reviewers.map((reviewer) => (
              <span
                key={reviewer.login}
                className="rounded-full border border-border/50 bg-muted/40 px-1.5 text-[10px]"
              >
                {cnbReviewerSummary(reviewer.login, reviewer.reviewState)}
              </span>
            ))}
          </div>

          <Tabs defaultValue="conversation" className="min-h-0 flex-1">
            <TabsList variant="line" size="sm">
              <TabsTrigger value="conversation">
                {t('cnb.tasks.conversation', 'Conversation')}
              </TabsTrigger>
              <TabsTrigger value="checks">
                {t('cnb.tasks.checks', 'Checks')}
                {detail.checksSummary
                  ? ` (${detail.checksSummary.passed}/${detail.checksSummary.total})`
                  : ''}
              </TabsTrigger>
              <TabsTrigger value="commits">
                {t('cnb.tasks.commits', 'Commits ({{count}})', { count: detail.commits.length })}
              </TabsTrigger>
              <TabsTrigger value="files">
                {t('cnb.tasks.files', 'Files ({{count}})', { count: detail.files.length })}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="min-h-0">
              <div className="scrollbar-sleek min-h-0 overflow-y-auto">
                <CnbPullBodyEditor
                  api={api}
                  row={row}
                  detail={detail}
                  onSave={(body) => runWrite({ action: 'update', body })}
                  onError={setError}
                />
                <CnbPullActions
                  detail={detail}
                  busy={writer.busy}
                  onReview={(event, body) => runWrite({ action: 'review', event, body })}
                  onMerge={(style, title, message) =>
                    void runWrite({ action: 'merge', style, title, message })
                  }
                  onReviewers={(reviewers) => void runWrite({ action: 'reviewers', reviewers })}
                />
                <CnbCommentComposer
                  api={api}
                  target={{ repoId: row.repoId, issueNumber: null }}
                  busy={writer.busy}
                  onSubmit={(body) => runWrite({ action: 'comment', body })}
                />
                <section className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold">
                    {t('cnb.tasks.discussion', 'Discussion ({{count}})', {
                      count: detail.comments.length
                    })}
                  </h3>
                  {detail.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-md border border-border/50 bg-background p-2"
                    >
                      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                        {comment.author}
                      </div>
                      <CommentMarkdown content={comment.body} />
                    </div>
                  ))}
                </section>
              </div>
            </TabsContent>
            <TabsContent value="checks" className="min-h-0">
              {detail.checksSummary ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'cnb.review.checks',
                    '{{passed}} passed · {{failed}} failed · {{pending}} pending',
                    {
                      passed: detail.checksSummary.passed,
                      failed: detail.checksSummary.failed,
                      pending: detail.checksSummary.pending
                    }
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('cnb.tasks.noChecks', 'No checks reported for this commit.')}
                </p>
              )}
            </TabsContent>
            <TabsContent value="commits" className="min-h-0">
              <div className="scrollbar-sleek min-h-0 overflow-y-auto">
                <ul className="space-y-1.5">
                  {detail.commits.map((commit) => (
                    <li key={commit.sha} className="flex min-w-0 items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">
                        {commit.sha.slice(0, 8)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{commit.message}</span>
                      {commit.author ? (
                        <span className="text-muted-foreground">{commit.author}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
            <TabsContent value="files" className="min-h-0">
              <div className="scrollbar-sleek min-h-0 overflow-y-auto">
                <ul className="space-y-1.5">
                  {detail.files.map((file) => (
                    <li key={file.path} className="text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                        <span className="text-status-success">+{file.additions}</span>
                        <span className="text-destructive">-{file.deletions}</span>
                      </div>
                      {file.patch ? (
                        <pre className="scrollbar-sleek mt-1 max-h-64 overflow-auto rounded bg-muted/30 p-2 text-[11px]">
                          {file.patch}
                        </pre>
                      ) : (
                        <span className="text-muted-foreground">
                          {t(
                            'cnb.review.noPatch',
                            'Open this pull request on CNB to view the full diff.'
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {detail.filesTruncated ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('cnb.review.moreFiles', 'Open on CNB to see all changed files.')}
                  </p>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}
