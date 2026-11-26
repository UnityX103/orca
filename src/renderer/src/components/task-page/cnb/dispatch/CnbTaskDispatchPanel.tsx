// The BoBot dispatch of one CNB record: its runtime record (the truth for the run), the workspace it
// runs in, and the instructions to send. Number, kind and repo show together so the same number in
// two repositories never reads as one record.
import { ExternalLink, LoaderCircle, RotateCcw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type {
  CnbTaskDispatch,
  CnbTaskDispatchTarget
} from '../../../../../../shared/cnb/cnb-task-dispatch'
import type { BoBotChatAvailability } from './cnb-bobot-chat-availability'
import type { CnbDispatchState } from './use-cnb-task-dispatch'

const STATUS_KEYS: Record<CnbTaskDispatch['status'], { key: string; fallback: string }> = {
  starting: { key: 'cnb.dispatch.statusStarting', fallback: 'Starting' },
  working: { key: 'cnb.dispatch.statusWorking', fallback: 'Working' },
  waiting: { key: 'cnb.dispatch.statusWaiting', fallback: 'Waiting on you' },
  idle: { key: 'cnb.dispatch.statusIdle', fallback: 'Idle' },
  completed: { key: 'cnb.dispatch.statusCompleted', fallback: 'Completed' },
  failed: { key: 'cnb.dispatch.statusFailed', fallback: 'Failed' },
  unknown: { key: 'cnb.dispatch.statusUnknown', fallback: 'Status unknown' }
}

const STATUS_VARIANT: Record<
  CnbTaskDispatch['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  starting: 'secondary',
  working: 'default',
  waiting: 'outline',
  idle: 'outline',
  completed: 'secondary',
  failed: 'destructive',
  unknown: 'outline'
}

const AVAILABILITY_COPY: Record<
  Exclude<BoBotChatAvailability, { supported: true }>['reason'],
  { key: string; fallback: string }
> = {
  'api-missing': {
    key: 'cnb.dispatch.limitApi',
    fallback: 'BoBot dispatch needs a newer Orca desktop build on this machine.'
  },
  'no-workspace': {
    key: 'cnb.dispatch.limitNoWorkspace',
    fallback: 'Create a workspace for this record first, then dispatch it to BoBot.'
  },
  'unsupported-host': {
    key: 'cnb.dispatch.limitHost',
    fallback: 'BoBot dispatch is available for workspaces on this Orca host.'
  },
  'capabilities-unknown': {
    key: 'cnb.dispatch.limitCapabilities',
    fallback: "Orca can't tell yet whether this host runs BoBot chats. Reconnect it and try again."
  },
  'chat-unsupported': {
    key: 'cnb.dispatch.limitChat',
    fallback: 'This host does not offer BoBot chat sessions, so the record stays here.'
  }
}

export function CnbTaskDispatchPanel({
  target,
  rowTitle,
  repoSlug,
  worktree,
  state,
  spec,
  onSpecChange,
  onCreateWorkspace,
  onOpenWorkspace
}: {
  target: CnbTaskDispatchTarget
  rowTitle: string
  /** The repository the record belongs to, shown with its kind and number. */
  repoSlug: string
  /** The workspace this record is attached to, which the dispatch runs in. */
  worktree: Worktree | null
  /** The runtime record and its actions, plus whether this host may dispatch at all. */
  state: CnbDispatchState & { availability: BoBotChatAvailability }
  /** The instructions to send; kept by the detail so it survives closing and reopening. */
  spec: string
  onSpecChange: (next: string) => void
  onCreateWorkspace: () => void
  onOpenWorkspace: (worktree: Worktree) => void
}): React.JSX.Element {
  const t = useTranslate()
  const record = state.dispatch
  const availability = state.availability
  const kind =
    target.type === 'pr' ? t('cnb.dispatch.kindPr', 'PR') : t('cnb.dispatch.kindIssue', 'Issue')
  const canStart = availability.supported && Boolean(worktree) && !state.busy && spec.trim() !== ''

  const submit = (): void => {
    if (!worktree) {
      return
    }
    void state.start({
      repoId: target.repoId,
      type: target.type,
      number: target.number,
      worktreeId: worktree.id,
      title: rowTitle,
      spec: spec.trim()
    })
  }

  return (
    <section
      className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3"
      aria-label={t('cnb.dispatch.title', 'BoBot dispatch')}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t('cnb.dispatch.title', 'BoBot dispatch')}</span>
        <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
          {repoSlug} · {kind} #{target.number}
        </span>
        {record ? (
          <Badge variant={STATUS_VARIANT[record.status]}>
            {t(STATUS_KEYS[record.status].key, STATUS_KEYS[record.status].fallback)}
          </Badge>
        ) : null}
        <span className="min-w-0 flex-1" />
        {worktree ? (
          <Button
            variant="ghost"
            size="xs"
            className="min-w-0"
            onClick={() => onOpenWorkspace(worktree)}
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{worktree.displayName}</span>
          </Button>
        ) : record ? null : (
          <Button
            variant="outline"
            size="xs"
            disabled={!availability.supported && availability.reason !== 'no-workspace'}
            onClick={onCreateWorkspace}
          >
            {t('cnb.dispatch.createWorkspace', 'Create workspace')}
          </Button>
        )}
      </div>

      {state.error ? (
        // A start or a retry that failed says why here, whichever state the record is in.
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      {availability.supported || record ? null : (
        <p role="status" className="text-xs leading-[18px] text-muted-foreground">
          {t(
            AVAILABILITY_COPY[availability.reason].key,
            AVAILABILITY_COPY[availability.reason].fallback
          )}
        </p>
      )}

      {record ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          <span className="font-mono">{record.dispatchId}</span>
          {worktree ? null : (
            // Its workspace is not in this window's catalog; name it rather than offer a new one.
            <span className="truncate font-mono">{record.worktreeId}</span>
          )}
          {record.error ? (
            <span role="alert" className="min-w-0 flex-1 truncate text-destructive">
              {record.error}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {record.sessionId ? (
            <Button variant="ghost" size="xs" onClick={() => state.openSession()}>
              {t('cnb.dispatch.openSession', 'Open BoBot chat')}
            </Button>
          ) : null}
          {record.canRetry ? (
            <Button
              variant="outline"
              size="xs"
              // A retry runs in the record's own workspace, so an unattached one never blocks it.
              disabled={state.busy || !state.supported}
              onClick={() => void state.retry()}
            >
              <RotateCcw className="size-3" />
              {t('cnb.dispatch.retry', 'Retry')}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <Textarea
            aria-label={t('cnb.dispatch.spec', 'What BoBot should do')}
            value={spec}
            rows={3}
            placeholder={t(
              'cnb.dispatch.specPlaceholder',
              'Describe what BoBot should do with this record. It starts in the workspace above.'
            )}
            onChange={(event) => onSpecChange(event.target.value)}
          />

          <div className="flex items-center justify-end gap-2">
            <Button size="xs" disabled={!canStart} onClick={submit}>
              {state.busy ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : (
                <Send className="size-3" />
              )}
              {t('cnb.dispatch.dispatch', 'Dispatch to BoBot')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
