import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertCircle, CheckCircle2, Clock3, Minus } from 'lucide-react'
import { cnbChecksLabel, cnbChecksTone } from '../cnb-task-row-model'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbCheckState, CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

type ChecksState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready'
      checks: CnbCheckState
      counts: { passed: number; failed: number; pending: number } | null
    }
  | { status: 'error' }

/** Lazy-loads a PR row's checks when it scrolls into view, then opens the details checks tab. */
export function CnbChecksCell({
  api,
  row,
  onOpenChecks
}: {
  api: CnbApi | undefined
  row: CnbTaskRow
  onOpenChecks: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [state, setState] = useState<ChecksState>({ status: 'idle' })
  const requested = useRef(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!api || row.state === 'merged') {
      return
    }
    const load = (): void => {
      if (requested.current) {
        return
      }
      requested.current = true
      setState({ status: 'loading' })
      void api.pullChecks({ repoId: row.repoId, number: row.number }).then(
        (result) => {
          if (result.ok) {
            setState({ status: 'ready', checks: result.checks, counts: result.summary })
          } else {
            setState({ status: 'error' })
          }
        },
        () => setState({ status: 'error' })
      )
    }
    const node = triggerRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      load()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          load()
          observer.disconnect()
        }
      },
      { rootMargin: '160px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [api, row.repoId, row.number, row.state])

  const checks: CnbCheckState | null = state.status === 'ready' ? state.checks : null
  const label =
    state.status === 'loading'
      ? t('cnb.tasks.checksLoading', 'Loading checks…')
      : state.status === 'error'
        ? t('cnb.tasks.checksError', 'Checks unavailable')
        : checks
          ? (cnbChecksLabel(checks, t) ?? t('cnb.tasks.checksNeutral', 'No checks'))
          : t('cnb.tasks.checksNeutral', 'No checks')
  const tone = checks ? cnbChecksTone(checks) : 'text-muted-foreground'
  const Icon =
    checks === 'success'
      ? CheckCircle2
      : checks === 'failure'
        ? AlertCircle
        : checks === 'pending'
          ? Clock3
          : Minus
  const summary =
    state.status === 'ready' && state.counts
      ? t('cnb.tasks.checksCounts', '{{passed}} passed · {{failed}} failed · {{pending}} pending', {
          passed: state.counts.passed,
          failed: state.counts.failed,
          pending: state.counts.pending
        })
      : t('cnb.tasks.openChecks', 'Open checks for this pull request')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpenChecks()
          }}
          className={cn(
            'inline-flex max-w-full items-center gap-1 rounded-full border border-border/40 px-1.5 py-0.5 text-[11px] font-medium transition hover:bg-accent',
            tone
          )}
        >
          <Icon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {summary}
      </TooltipContent>
    </Tooltip>
  )
}
