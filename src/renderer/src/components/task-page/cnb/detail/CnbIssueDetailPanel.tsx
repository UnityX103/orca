import { useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ArrowRight, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { CopyTextButton } from '@/components/clipboard/CopyTextButton'
import CommentMarkdown from '@/components/comment-markdown/CommentMarkdown'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import { useCnbIssueDetail, useCnbIssueWriter } from '../use-cnb-task-detail'
import { CnbIssueEditor } from './CnbIssueEditor'
import { CnbCommentComposer } from './CnbCommentComposer'

type CnbApi = NonNullable<PreloadApi['cnb']>

export function CnbIssueDetailPanel({
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
  const state = useCnbIssueDetail({ api, row, refreshNonce })
  const writer = useCnbIssueWriter({
    api,
    row,
    onWritten: () => {
      setRefreshNonce((value) => value + 1)
      onChanged()
    }
  })
  const [error, setError] = useState<string | null>(null)

  const refresh = () => setRefreshNonce((value) => value + 1)
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

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t('cnb.tasks.backToList', 'Back to list')}
        </Button>
        <span className="font-mono text-xs text-muted-foreground">#{row.number}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {state.status === 'ready' ? state.detail.title : row.title}
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
          {t('cnb.tasks.loadingDetail', 'Loading issue…')}
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
        >
          <span>
            {state.reason === 'not-found'
              ? t('cnb.tasks.notFound', 'This issue no longer exists.')
              : t('cnb.tasks.detailError', 'Could not load this issue.')}
          </span>
          <Button variant="outline" size="sm" onClick={refresh}>
            {t('cnb.tasks.retry', 'Try again')}
          </Button>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-muted-foreground">
            <Badge variant={state.detail.state === 'open' ? 'default' : 'secondary'}>
              {state.detail.state === 'open'
                ? t('cnb.tasks.stateOpen', 'Open')
                : t('cnb.tasks.stateClosed', 'Closed')}
            </Badge>
            {state.detail.author ? <span>{state.detail.author}</span> : null}
            {state.detail.labels.map((label) => (
              <span
                key={label.name}
                className="rounded-full border border-border/50 bg-muted/40 px-1.5 text-[10px]"
              >
                {label.name}
              </span>
            ))}
          </div>
          <CnbIssueEditor
            api={api}
            repoRow={row}
            detail={state.detail}
            busy={writer.busy}
            onSave={(payload) => void runWrite(payload)}
          />
          <section className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold">
              {t('cnb.tasks.comments', 'Comments ({{count}})', {
                count: state.detail.comments.length
              })}
            </h3>
            {state.detail.comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('cnb.tasks.noComments', 'No comments.')}
              </p>
            ) : (
              <ul className="space-y-2">
                {state.detail.comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="rounded-md border border-border/50 bg-background p-2"
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{comment.author}</span>
                    </div>
                    <CommentMarkdown content={comment.body} />
                  </li>
                ))}
              </ul>
            )}
            <CnbCommentComposer
              api={api}
              target={{ repoId: row.repoId, issueNumber: row.number }}
              busy={writer.busy}
              onSubmit={(body) => runWrite({ action: 'comment', body })}
            />
          </section>
        </div>
      ) : null}
    </div>
  )
}
