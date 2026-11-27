import { z } from 'zod'
import type { CnbCheckState, CnbListStateFilter, CnbTaskLabel } from '../../shared/cnb/cnb-tasks'
import { getCnbCredentialToken } from './credentials'
import { cnbRepositoryPath } from './repository-ref'
import type {
  CheckStatus,
  ProviderCheckSummary
} from '../../shared/github/pull-requests/pull-request-types'

export const PAGE_SIZE = 30
export const SEARCH_PAGE_SIZE = 50
// Why: CNB PR lists have no keyword param, so search scans a bounded window and reports the scope.
export const SEARCH_MAX_PAGES = 4
export const MAX_DETAIL_FILES = 100
export const MAX_DETAIL_COMMITS = 100
export const MAX_COMMENTS = 50

export const numberField = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger)

export const userInfo = z
  .object({ username: z.string().nullish(), nickname: z.string().nullish() })
  .nullish()
  .transform((value) => value?.nickname || value?.username || null)

export const labelInfo = z
  .object({ name: z.string(), color: z.string().nullish() })
  .nullish()
  .transform((label): CnbTaskLabel | null =>
    label ? { name: label.name, color: label.color ?? null } : null
  )

export const labelArray = z
  .array(labelInfo)
  .nullish()
  .transform((labels) => (labels ?? []).filter((label): label is CnbTaskLabel => label !== null))

const reviewer = z
  .object({
    user: z.object({ username: z.string().nullish() }).nullish(),
    review_state: z.string().nullish()
  })
  .nullish()
  .transform((value) => ({
    login: value?.user?.username || '',
    reviewState: value?.review_state ?? null
  }))

export const reviewerList = z
  .array(reviewer)
  .nullish()
  .transform((values) => (values ?? []).filter((value) => value.login))

export const reviewState = z.enum(['open', 'closed', 'merged'])

export const pullRow = z.object({
  number: numberField,
  title: z.string(),
  state: reviewState,
  is_merged: z.boolean().optional(),
  is_wip: z.boolean().optional(),
  mergeable_state: z.string().nullish(),
  author: userInfo,
  assignees: z
    .array(z.object({ username: z.string().nullish(), nickname: z.string().nullish() }))
    .nullish(),
  labels: labelArray,
  reviewers: reviewerList,
  updated_at: z.string().nullish(),
  last_acted_at: z.string().nullish(),
  created_at: z.string().nullish()
})

export const issueRow = z.object({
  number: numberField,
  title: z.string(),
  state: z.enum(['open', 'closed']),
  author: userInfo,
  assignees: z
    .array(z.object({ username: z.string().nullish(), nickname: z.string().nullish() }))
    .nullish(),
  labels: labelArray,
  updated_at: z.string().nullish(),
  last_acted_at: z.string().nullish(),
  created_at: z.string().nullish()
})

export const commitStatusItem = z.object({
  context: z.string().nullish(),
  state: z.string(),
  target_url: z.string().nullish()
})

const commitStatusGroup = z.object({
  sha: z.string().optional(),
  state: z.string().optional(),
  statuses: z.array(commitStatusItem).nullish()
})

// Two shapes exist: the official /pulls/{number}/commit-statuses 200 is one object
// { state, statuses }, while the history form is an array of sha groups. Normalize both to an
// array of groups so summarizeChecks handles either. `null`/absent means "no data", not "empty".
export const commitStatusMap = z
  .union([z.array(commitStatusGroup), commitStatusGroup])
  .nullish()
  .transform((value): z.output<typeof commitStatusGroup>[] | null =>
    value == null ? null : Array.isArray(value) ? value : [value]
  )

export function displayName(
  user: { username?: string | null; nickname?: string | null } | null | undefined
): string | null {
  return user?.nickname || user?.username || null
}

/** Shared token read for the CNB task modules. */
export async function credential(): Promise<string | null> {
  return getCnbCredentialToken()
}

export function toCheckState(state: string | null | undefined): CheckStatus {
  switch (state?.toLowerCase() ?? '') {
    case 'success':
      return 'success'
    case 'error':
    case 'failed':
    case 'failure':
    case 'timeout':
      return 'failure'
    case 'pending':
    case 'running':
      return 'pending'
    default:
      return 'neutral'
  }
}

export function summarizeChecks(
  rows: z.output<typeof commitStatusMap>,
  headSha: string | null
): { status: CnbCheckState; summary: ProviderCheckSummary | null } {
  if (!rows || rows.length === 0) {
    return { status: 'neutral', summary: null }
  }
  const totals = { success: 0, failure: 0, pending: 0, neutral: 0 }
  let aggregate = 'neutral'
  let matched = false
  for (const group of rows) {
    if (group.sha && headSha && group.sha !== headSha) {
      continue
    }
    matched = true
    aggregate = group.state ?? aggregate
    for (const item of group.statuses ?? []) {
      totals[toCheckState(item.state)]++
    }
  }
  if (!matched) {
    return { status: 'neutral', summary: null }
  }
  const status: CnbCheckState = totals.failure
    ? 'failure'
    : totals.pending
      ? 'pending'
      : toCheckState(aggregate)
  const total = totals.success + totals.failure + totals.pending + totals.neutral
  return total > 0
    ? {
        status,
        summary: {
          state: status,
          total,
          passed: totals.success,
          failed: totals.failure,
          pending: totals.pending,
          neutral: totals.neutral
        }
      }
    : { status, summary: null }
}

export function mapMergeable(
  value: string | null | undefined
): 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' {
  if (value === 'mergeable') {
    return 'MERGEABLE'
  }
  if (value === 'conflict' || value === 'no-merge-base') {
    return 'CONFLICTING'
  }
  return 'UNKNOWN'
}

export function issueWebUrl(repository: string, number: number): string {
  return `https://cnb.cool${cnbRepositoryPath(repository)}/issues/${number}`
}

export function pullWebUrl(repository: string, number: number): string {
  return `https://cnb.cool${cnbRepositoryPath(repository)}/pulls/${number}`
}

export function stateParam(filter: CnbListStateFilter): string | null {
  return filter === 'all' ? 'all' : filter
}

export function csv(values: readonly string[]): string | undefined {
  const trimmed = values.map((value) => value.trim()).filter(Boolean)
  return trimmed.length > 0 ? trimmed.join(',') : undefined
}
