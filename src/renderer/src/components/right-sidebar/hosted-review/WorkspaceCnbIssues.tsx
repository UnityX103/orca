import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useConfirmationDialog } from '@/components/dismiss/confirmation/confirmation-dialog-context'
import { useTranslate } from '@/i18n/use-translate'
import { openAppHttpLinkFromAnchor } from '@/lib/browser/navigation/app-http-link-open'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { forgeCredentialTarget } from '@/runtime/source-control/forge/forge-credential-target'
import { parseCnbWorkItemUrl } from '../../../../../shared/cnb/cnb-work-item-url'
import type {
  CnbDetailResult,
  CnbIssueDetail,
  CnbWriteResult
} from '../../../../../shared/cnb/cnb-tasks'
import {
  getWorktreeExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../../../shared/execution-host/execution-host'
import type { Repo } from '../../../../../shared/repository/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { getWorkspaceAttachments } from '../../../../../shared/workspace-attachments/workspace-attachments'

type IssueStatus = Pick<CnbIssueDetail, 'title' | 'state'>

export function WorkspaceCnbIssues({
  workspace,
  repo
}: {
  workspace: Worktree
  repo?: Repo | null
}): React.JSX.Element | null {
  const ownerHostId = workspace.runtimeOwnerEnvironmentId
    ? toRuntimeExecutionHostId(workspace.runtimeOwnerEnvironmentId)
    : getWorktreeExecutionHostId(workspace, repo ?? undefined)
  const issues = getWorkspaceAttachments(workspace).flatMap((item) => {
    if (item.provider !== 'cnb' || item.type !== 'issue' || !item.url) {
      return []
    }
    const issue = parseCnbWorkItemUrl(item.url)
    if (issue?.type !== 'issue' || issue.number !== item.number) {
      return []
    }
    const hostId = item.taskSourceContext?.hostId ?? ownerHostId
    const slug = issue.repository.split('/').map(encodeURIComponent).join('/')
    return [
      {
        ...issue,
        title: item.title,
        hostId,
        url: `https://cnb.cool/${slug}/-/issues/${issue.number}`
      }
    ]
  })
  if (issues.length === 0) {
    return null
  }
  return (
    <div className="space-y-2 border-b border-border px-3 py-2.5">
      {issues.map((issue) => (
        <WorkspaceCnbIssueRow
          key={`${ownerHostId}:${workspace.id}:${workspace.instanceId ?? ''}:${issue.hostId}:${issue.url}`}
          workspaceId={workspace.id}
          {...issue}
        />
      ))}
    </div>
  )
}

function WorkspaceCnbIssueRow({
  workspaceId,
  url,
  number,
  repository,
  title,
  hostId
}: {
  workspaceId: string
  url: string
  number: number
  repository: string
  title?: string
  hostId: string
}): React.JSX.Element {
  const t = useTranslate()
  const confirm = useConfirmationDialog()
  const requestRef = useRef<AbortController | null>(null)
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState<CnbDetailResult<IssueStatus> | null>(null)
  const [closing, setClosing] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  useEffect(() => {
    const request = new AbortController()
    requestRef.current = request
    async function load(): Promise<void> {
      let result: CnbDetailResult<IssueStatus>
      try {
        result = await callRuntimeRpc<CnbDetailResult<IssueStatus>>(
          forgeCredentialTarget({ repoOwnerExecutionHostId: hostId }),
          'cnb.getIssueStatus',
          { url },
          { signal: request.signal, background: retry === 0 }
        )
      } catch {
        result = { ok: false, reason: 'request-failed' }
      }
      if (!request.signal.aborted) {
        setStatus(result)
      }
    }
    void load()
    return () => request.abort()
  }, [hostId, retry, url])

  const detail = status?.ok ? status.detail : null
  const closeLabel = t('cnb.tasks.closeIssue', 'Close issue')
  const closeFailure = t('cnb.review.closeIssueFailed', 'Could not close the CNB issue.')
  const issueLabel = t('workspace.links.issueReference', 'Issue #{{number}}', { number })

  async function closeIssue(): Promise<void> {
    const request = requestRef.current
    if (!request || closing || detail?.state !== 'open') {
      return
    }
    setClosing(true)
    setCloseError(null)
    let progressTimer: number | undefined
    try {
      const confirmed = await confirm({
        title: t('cnb.review.closeIssueTitle', 'Close Issue #{{number}}?', { number }),
        description: `${repository} · ${detail.title}`,
        confirmLabel: closeLabel,
        confirmVariant: 'destructive',
        signal: request.signal
      })
      if (!confirmed || request.signal.aborted) {
        return
      }
      progressTimer = window.setTimeout(() => {
        if (!request.signal.aborted) {
          setShowProgress(true)
        }
      }, 200)
      const result = await callRuntimeRpc<CnbWriteResult>(
        forgeCredentialTarget({ repoOwnerExecutionHostId: hostId }),
        'cnb.closeIssue',
        { url }
      )
      if (request.signal.aborted) {
        return
      }
      if (result.ok) {
        setStatus({ ok: true, detail: { ...detail, state: 'closed' } })
      } else {
        setCloseError(
          result.reason === 'close-unconfirmed'
            ? t('cnb.review.closeIssueUnconfirmed', 'CNB did not confirm that the issue closed.')
            : `${closeFailure} ${result.reason}`
        )
      }
    } catch {
      if (!request.signal.aborted) {
        setCloseError(closeFailure)
      }
    } finally {
      window.clearTimeout(progressTimer)
      if (!request.signal.aborted) {
        setClosing(false)
        setShowProgress(false)
      }
    }
  }

  const loadError =
    status?.ok === false
      ? status.reason === 'not-connected'
        ? t('cnb.tasks.connect', 'Connect CNB in Integrations to browse repository tasks.')
        : t('cnb.review.linkedIssueLoadFailed', 'Could not read the linked CNB issue.')
      : null
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <a
          href={url}
          onClick={(event) => openAppHttpLinkFromAnchor(event, workspaceId)}
          className="min-w-0 flex-1 truncate rounded-sm text-xs text-foreground hover:underline"
          title={detail?.title ?? title ?? repository}
        >
          <span className="font-medium">{issueLabel}</span>
          {(detail?.title ?? title) && (
            <span className="text-muted-foreground"> · {detail?.title ?? title}</span>
          )}
        </a>
        {detail?.state === 'closed' ? (
          <Badge variant="secondary" role="status">
            {t('cnb.tasks.stateClosed', 'Closed')}
          </Badge>
        ) : loadError ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              setStatus(null)
              setRetry((current) => current + 1)
            }}
          >
            {t('cnb.tasks.retry', 'Try again')}
          </Button>
        ) : (
          <Button
            size="xs"
            variant="outline"
            disabled={!detail || closing}
            aria-busy={!detail || closing}
            className="relative"
            onClick={() => void closeIssue()}
          >
            <span className={showProgress ? 'opacity-0' : undefined}>{closeLabel}</span>
            {showProgress && <LoadingSpinner className="absolute size-3.5" />}
          </Button>
        )}
      </div>
      {(closeError || loadError) && (
        <p role="alert" className="break-words text-xs text-destructive">
          {closeError ?? loadError}
        </p>
      )}
    </div>
  )
}
