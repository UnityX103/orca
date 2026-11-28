import { z } from 'zod'
import { lazyZodSchema } from '../../shared/schema/lazy-zod-schema'
import type { HostedReviewInfo } from '../../shared/source-control/hosted-review/hosted-review-contracts'
import type {
  CheckStatus,
  ProviderCheckSummary
} from '../../shared/github/pull-requests/pull-request-types'
import { requireCnbCredentialToken } from './credentials'
import { getPRConflictSummary } from '../github/pull-requests/conflicts/conflict-summary'
import { isFullGitObjectId } from '../git/refs/resolution/commit-object-ref'
import type { HostedReviewLocalGitOptions } from '../source-control/hosted-review-git-options'
import { readCnbSourceBranch } from './pull-source-branch'
import { cnbHasNextPage, cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'

const pullRef = lazyZodSchema(() =>
  z.object({
    ref: z.string(),
    sha: z.string().nullish(),
    repo: z.object({ path: z.string().nullish() }).nullish()
  })
)
const pull = lazyZodSchema(() =>
  z.object({
    number: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .refine(Number.isSafeInteger),
    title: z.string(),
    body: z.string().nullish(),
    state: z.enum(['open', 'closed', 'merged']),
    head: pullRef,
    base: pullRef,
    is_wip: z.boolean().optional(),
    is_merged: z.boolean().optional(),
    mergeable_state: z.string().nullish(),
    blocked_on: z.string().nullish(),
    updated_at: z.string().nullish(),
    last_acted_at: z.string().nullish(),
    created_at: z.string().nullish()
  })
)
const pullList = lazyZodSchema(() => z.array(pull).nullable())
const checks = lazyZodSchema(() =>
  z.object({
    sha: z.string().optional(),
    state: z.string().optional(),
    statuses: z.array(z.object({ state: z.string() })).nullish()
  })
)
type Pull = z.output<typeof pull>
type ConflictContext = { repoPath: string; localGitOptions: HostedReviewLocalGitOptions }

const PAGE_SIZE = 100
const MAX_PAGES = 5

export function pullPath(repository: string): string {
  return `${cnbRepositoryPath(repository)}/pulls`
}

function branchName(ref: string): string {
  return ref.replace(/^refs\/heads\//, '')
}

export function cnbReviewState(pr: Pull): HostedReviewInfo['state'] {
  if (pr.is_merged || pr.state === 'merged') {
    return 'merged'
  }
  return pr.state === 'open' && pr.is_wip ? 'draft' : pr.state
}

export function cnbPullMergeability(pr: Pull): HostedReviewInfo['mergeable'] {
  if (pr.mergeable_state === 'conflict' || pr.blocked_on === 'code_conflict') {
    return 'CONFLICTING'
  }
  return pr.mergeable_state === 'mergeable' ? 'MERGEABLE' : 'UNKNOWN'
}

export function cnbPullMergeBlocker(pr: Pull): string | null {
  return pr.blocked_on && pr.blocked_on !== 'unblocked' ? pr.blocked_on : null
}

export function cnbMergedSourceBranch(
  repository: string,
  pr: Pull
): { name: string; sha: string } | null {
  const name = branchName(pr.head.ref)
  const sha = pr.head.sha
  if (
    cnbReviewState(pr) !== 'merged' ||
    pr.head.repo?.path?.toLowerCase() !== repository.toLowerCase() ||
    !name ||
    name === branchName(pr.base.ref) ||
    !sha ||
    !isFullGitObjectId(sha)
  ) {
    return null
  }
  return { name, sha }
}

function checkState(state: string | undefined): CheckStatus {
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

function requireOk(response: Response): void {
  if (!response.ok) {
    void response.body?.cancel().catch(() => {})
    throw new Error(`CNB PR lookup failed (HTTP ${response.status}).`)
  }
}

async function readChecks(
  repository: string,
  pr: Pull,
  token: string
): Promise<{ status: CheckStatus; checksSummary?: ProviderCheckSummary }> {
  try {
    const response = await cnbRequest(`${pullPath(repository)}/${pr.number}/commit-statuses`, token)
    requireOk(response)
    const result = checks.parse(await response.json())
    const rows = result.statuses ?? []
    if (result.sha && pr.head.sha && result.sha !== pr.head.sha) {
      return { status: 'neutral' }
    }
    const totals = { success: 0, failure: 0, pending: 0, neutral: 0 }
    for (const row of rows) {
      totals[checkState(row.state)]++
    }
    const aggregate = checkState(result.state)
    const status = totals.failure ? 'failure' : totals.pending ? 'pending' : aggregate
    return {
      status,
      ...(rows.length > 0
        ? {
            checksSummary: {
              state: status,
              total: rows.length,
              passed: totals.success,
              failed: totals.failure,
              pending: totals.pending,
              neutral: totals.neutral
            }
          }
        : {})
    }
  } catch {
    return { status: 'neutral' }
  }
}

async function hostedReview(
  repository: string,
  pr: Pull,
  token: string,
  conflictContext?: ConflictContext
): Promise<HostedReviewInfo> {
  const state = cnbReviewState(pr)
  const mergeable = state === 'open' || state === 'draft' ? cnbPullMergeability(pr) : 'UNKNOWN'
  const baseRefName = branchName(pr.base.ref)
  const [checkState, conflictSummary, sourceBranch] = await Promise.all([
    readChecks(repository, pr, token),
    state === 'open' &&
    mergeable === 'CONFLICTING' &&
    conflictContext &&
    baseRefName &&
    pr.base.sha &&
    isFullGitObjectId(pr.base.sha) &&
    pr.head.sha &&
    isFullGitObjectId(pr.head.sha)
      ? getPRConflictSummary(
          conflictContext.repoPath,
          baseRefName,
          pr.base.sha,
          pr.head.sha,
          conflictContext.localGitOptions
        ).catch(() => undefined)
      : undefined,
    getDeletableSourceBranch(repository, pr, token)
  ])
  return {
    provider: 'cnb',
    number: pr.number,
    title: pr.title,
    state,
    url: `https://cnb.cool${pullPath(repository)}/${pr.number}`,
    updatedAt: pr.updated_at ?? pr.last_acted_at ?? pr.created_at ?? '',
    mergeable,
    mergeStateStatus: cnbPullMergeBlocker(pr) ?? pr.mergeable_state,
    ...(pr.head.sha && isFullGitObjectId(pr.head.sha) ? { headSha: pr.head.sha } : {}),
    baseRefName,
    ...(conflictSummary ? { conflictSummary } : {}),
    ...(sourceBranch ? { cnbSourceBranch: sourceBranch } : {}),
    ...checkState
  }
}

async function getDeletableSourceBranch(repository: string, pr: Pull, token: string) {
  const head = cnbMergedSourceBranch(repository, pr)
  if (!head) {
    return undefined
  }
  const source = await readCnbSourceBranch(repository, head.name, token).catch(() => null)
  return source && !source.protected && !source.locked && source.commit.sha === head.sha
    ? head.name
    : undefined
}

export async function readCnbPull(
  repository: string,
  number: number,
  token: string
): Promise<Pull | null> {
  if (!Number.isSafeInteger(number) || number <= 0) {
    return null
  }
  const response = await cnbRequest(`${pullPath(repository)}/${number}`, token)
  if (response.status === 404) {
    await discardCnbBody(response)
    return null
  }
  requireOk(response)
  return pull.parse(await response.json())
}

export async function getCnbReviewByNumber(
  repository: string,
  number: number,
  conflictContext?: ConflictContext
): Promise<HostedReviewInfo | null> {
  const token = await requireCnbCredentialToken()
  const pr = await readCnbPull(repository, number, token)
  return pr ? hostedReview(repository, pr, token, conflictContext) : null
}

export async function getCnbReviewForBranch(
  repository: string,
  branch: string,
  currentHeadOid: string | null | undefined,
  conflictContext?: ConflictContext
): Promise<HostedReviewInfo | null> {
  const token = await requireCnbCredentialToken()
  const desiredBranch = branchName(branch)
  const matches = (pr: Pull): boolean => {
    const from = pr.head.repo?.path
    const sameRepository = from
      ? from.toLowerCase() === repository.toLowerCase()
      : Boolean(currentHeadOid && pr.head.sha === currentHeadOid)
    return sameRepository && branchName(pr.head.ref) === desiredBranch
  }
  const open = await findCnbPull(repository, token, 'open', matches)
  const pr =
    open ??
    (currentHeadOid
      ? await findCnbPull(
          repository,
          token,
          'closed',
          (candidate) => matches(candidate) && candidate.head.sha === currentHeadOid
        )
      : null)
  return pr ? hostedReview(repository, pr, token, conflictContext) : null
}

async function findCnbPull(
  repository: string,
  token: string,
  state: 'open' | 'closed',
  matches: (pull: Pull) => boolean
): Promise<Pull | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await cnbRequest(pullPath(repository), token, {
      page: String(page),
      page_size: String(PAGE_SIZE),
      state,
      order_by: '-updated_at'
    })
    requireOk(response)
    const rows = pullList.parse(await response.json()) ?? []
    const match = rows.find(matches)
    if (match) {
      return match
    }
    if (!cnbHasNextPage(response, page, PAGE_SIZE, rows.length)) {
      return null
    }
  }
  throw new Error('CNB PR lookup exceeded its page limit.')
}
