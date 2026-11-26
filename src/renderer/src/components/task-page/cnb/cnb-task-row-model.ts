import type { CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'
import type { Translate } from '@/i18n/use-translate'

/** Shared grid so the header and rows keep every column aligned. */
export const CNB_TASK_GRID_ISSUES =
  'min-w-[680px] grid-cols-[70px_minmax(220px,1fr)_120px_110px_92px]'
export const CNB_TASK_GRID_PULLS =
  'min-w-[880px] grid-cols-[70px_minmax(220px,1fr)_140px_110px_92px]'

export function cnbTaskGrid(kind: 'issues' | 'pull-requests'): string {
  return kind === 'issues' ? CNB_TASK_GRID_ISSUES : CNB_TASK_GRID_PULLS
}

export function cnbRowKey(row: CnbTaskRow): string {
  return `${row.repoId}:${row.repoSlug}:${row.number}`
}

/**
 * Status tones live here, not in the row component: the design-system lint bans raw palette
 * colors in .tsx, and these mirror GitHub's merge/check pill tones for cross-provider parity.
 */
export function cnbStateTone(state: CnbTaskRow['state']): string {
  if (state === 'open') {
    return 'text-emerald-600 dark:text-emerald-300'
  }
  if (state === 'merged') {
    return 'text-purple-600 dark:text-purple-300'
  }
  return 'text-rose-600 dark:text-rose-300'
}

export function cnbChecksTone(checks: CnbTaskRow['checks']): string {
  if (checks === 'success') {
    return 'text-emerald-600 dark:text-emerald-300'
  }
  if (checks === 'failure') {
    return 'text-rose-600 dark:text-rose-300'
  }
  return 'text-muted-foreground'
}

const REVIEWER_STATE_MARK: Record<string, string> = {
  approved: '✓',
  changes_requested: '✕',
  commented: '…'
}

export function cnbReviewerSummary(login: string, state: string | null): string {
  const mark = state ? REVIEWER_STATE_MARK[state] : undefined
  return mark ? `${login} ${mark}` : login
}

export function cnbStateLabel(row: Pick<CnbTaskRow, 'state' | 'isDraft'>, t: Translate): string {
  if (row.state === 'merged') {
    return t('cnb.tasks.stateMerged', 'Merged')
  }
  if (row.state === 'closed') {
    return t('cnb.tasks.stateClosed', 'Closed')
  }
  return row.isDraft ? t('cnb.tasks.stateDraft', 'Draft') : t('cnb.tasks.stateOpen', 'Open')
}

export function cnbChecksLabel(checks: CnbTaskRow['checks'], t: Translate): string | null {
  if (checks === 'success') {
    return t('cnb.tasks.checksPassing', 'Checks pass')
  }
  if (checks === 'failure') {
    return t('cnb.tasks.checksFailing', 'Checks fail')
  }
  if (checks === 'pending') {
    return t('cnb.tasks.checksPending', 'Checks running')
  }
  return null
}
