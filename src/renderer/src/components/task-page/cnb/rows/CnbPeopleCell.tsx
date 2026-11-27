import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronDown, LoaderCircle, UserRoundPlus } from 'lucide-react'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import type { CnbRowWriteRunner } from './use-cnb-row-writes'
import { useCnbMembers } from './use-cnb-members'

type CnbApi = NonNullable<PreloadApi['cnb']>

/**
 * Shared assignee (issue) / reviewer (PR) editor. CNB replaces the whole set on write, so a toggle
 * always sends the full local selection; a failed write reverts it and leaves the row untouched.
 */
export function CnbPeopleCell({
  api,
  row,
  kind,
  current,
  summaryText,
  writer
}: {
  api: CnbApi | undefined
  row: CnbTaskRow
  kind: 'issues' | 'pull-requests'
  /** Current logins for this row (assignees for issues, reviewer logins for PRs). */
  current: string[]
  /** Optional trigger label that carries review marks for PRs; defaults to the login list. */
  summaryText?: string
  writer: CnbRowWriteRunner
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(current)
  const selectedRef = useRef<string[]>(current)
  const [manual, setManual] = useState('')
  const isIssue = kind === 'issues'
  // Fetch candidates only while the picker is open; cache is per repo in the hook.
  const memberState = useCnbMembers(api, row, open)

  // Re-seed the editor when the row refreshes from a completed write.
  const currentKey = current.join(',')
  const [seededKey, setSeededKey] = useState(currentKey)
  if (seededKey !== currentKey) {
    setSeededKey(currentKey)
    setSelected(current)
    selectedRef.current = current
  }

  // Every toggle derives from the latest ref, so two quick clicks can't send a stale full set.
  const applySelection = useCallback((next: string[]): void => {
    selectedRef.current = next
    setSelected(next)
  }, [])

  const candidates = useMemo(() => {
    const byLogin = new Map<string, string>()
    if (memberState.status === 'ready') {
      for (const member of memberState.members) {
        byLogin.set(member.login, member.nickname ?? '')
      }
    }
    // Keep current members selectable even when the member lookup is forbidden or incomplete.
    for (const login of current) {
      if (!byLogin.has(login)) {
        byLogin.set(login, '')
      }
    }
    return [...byLogin.entries()].map(([login, nickname]) => ({ login, nickname }))
  }, [current, memberState])

  const summary =
    summaryText ??
    (current.length === 0
      ? isIssue
        ? t('cnb.tasks.unassigned', 'Unassigned')
        : t('cnb.tasks.noReviewers', 'No reviewers')
      : current.slice(0, 2).join(', ') + (current.length > 2 ? ` +${current.length - 2}` : ''))

  const commit = useCallback(
    async (next: string[]): Promise<void> => {
      const unique = [...new Set(next.map((login) => login.trim()).filter(Boolean))]
      const previous = selectedRef.current
      applySelection(unique)
      const failure = isIssue
        ? t('cnb.tasks.assigneesUpdateFailed', 'Failed to update assignees.')
        : t('cnb.tasks.reviewersUpdateFailed', 'Failed to update reviewers.')
      const result = isIssue
        ? await writer.runIssue(row, { action: 'assignees', assignees: unique }, failure)
        : await writer.runPull(row, { action: 'reviewers', reviewers: unique }, failure)
      if (!result.ok) {
        // Keep the row's original values so a failed write never looks applied.
        applySelection(previous)
      }
    },
    [applySelection, isIssue, row, t, writer]
  )

  const toggle = (login: string): void => {
    const latest = selectedRef.current
    const has = latest.some((entry) => entry.toLowerCase() === login.toLowerCase())
    void commit(
      has
        ? latest.filter((entry) => entry.toLowerCase() !== login.toLowerCase())
        : [...latest, login]
    )
  }

  const addManual = (): void => {
    const login = manual.trim()
    if (!login) {
      return
    }
    setManual('')
    void commit([...selectedRef.current, login])
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          applySelection(current)
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={writer.pending}
          data-cnb-people-trigger
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={
            isIssue
              ? t('cnb.tasks.editAssignees', 'Edit assignees: {{value}}', { value: summary })
              : t('cnb.tasks.editReviewers', 'Edit reviewers: {{value}}', { value: summary })
          }
          className={cn(
            'inline-flex h-6 max-w-full items-center gap-1 rounded-sm px-1 text-left text-xs transition hover:bg-accent',
            current.length > 0 ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {writer.pending ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin" aria-hidden />
          ) : null}
          <span className="min-w-0 truncate">{summary}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        tone="menu"
        className="w-64"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {memberState.status === 'loading' ? (
          <div role="status" className="px-2 py-2 text-xs text-muted-foreground">
            {t('cnb.tasks.loadingMembers', 'Loading members…')}
          </div>
        ) : null}
        {memberState.status === 'forbidden' ? (
          <div className="px-2 py-2 text-[11px] text-muted-foreground">
            {t(
              'cnb.tasks.membersForbidden',
              'Your CNB token cannot list project members (needs repo-manage:r). Type usernames below.'
            )}
          </div>
        ) : null}
        {memberState.status === 'error' ? (
          <div className="px-2 py-2 text-[11px] text-destructive">
            {t('cnb.tasks.membersFailed', 'Could not load members. Type usernames below.')}
          </div>
        ) : null}
        <div className="popover-scroll-content scrollbar-sleek -mx-1 px-1">
          {candidates.map((candidate) => {
            const isOn = selected.some(
              (entry) => entry.toLowerCase() === candidate.login.toLowerCase()
            )
            return (
              <button
                key={candidate.login}
                type="button"
                disabled={writer.pending}
                aria-pressed={isOn}
                onClick={() => toggle(candidate.login)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted/50 disabled:opacity-60"
              >
                <span
                  className={cn(
                    'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                    isOn ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                  )}
                  aria-hidden
                >
                  {isOn ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{candidate.login}</span>
                  {candidate.nickname ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {candidate.nickname}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-1 flex items-center gap-1 border-t border-border/50 pt-1">
          <Input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addManual()
              }
            }}
            placeholder={t('cnb.tasks.usernamePlaceholder', 'Username')}
            aria-label={t('cnb.tasks.usernamePlaceholder', 'Username')}
            density="compact"
          />
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={writer.pending || !manual.trim()}
            aria-label={
              isIssue
                ? t('cnb.tasks.addAssignee', 'Add assignee')
                : t('cnb.tasks.addReviewer', 'Add reviewer')
            }
            onClick={addManual}
          >
            <UserRoundPlus className="size-3.5" aria-hidden />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
