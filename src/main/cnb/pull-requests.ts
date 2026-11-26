import { z } from 'zod'
import type { CnbReviewDetails } from '../../shared/cnb/cnb-review-details'
import type { HostedReviewInfo } from '../../shared/source-control/hosted-review/hosted-review-contracts'
import type {
  CheckStatus,
  ProviderCheckSummary
} from '../../shared/github/pull-requests/pull-request-types'
import { getCnbCredentialToken } from './credentials'
import { cnbHasNextPage, cnbRequest } from './request'
import { cnbRepositoryPath, parseCnbReviewUrl } from './repository-ref'

const pullRef = z.object({
  ref: z.string(),
  sha: z.string().nullish(),
  repo: z.object({ path: z.string().nullish() }).nullish()
})
const pull = z.object({
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
  mergeable_state: z.string().optional(),
  updated_at: z.string().nullish(),
  last_acted_at: z.string().nullish(),
  created_at: z.string().nullish()
})
const pullList = z.array(pull).nullable()
const checks = z.object({
  sha: z.string().optional(),
  state: z.string().optional(),
  statuses: z.array(z.object({ state: z.string() })).nullish()
})
const comments = z
  .array(
    z.object({
      id: z.string(),
      author: z
        .object({ username: z.string().nullish(), nickname: z.string().nullish() })
        .nullish(),
      body: z.string().nullish()
    })
  )
  .nullable()
const files = z
  .array(
    z.object({
      filename: z.string(),
      additions: z.number().nullish(),
      deletions: z.number().nullish(),
      patch: z.string().nullish()
    })
  )
  .nullable()

type Pull = z.output<typeof pull>

const PAGE_SIZE = 100
const MAX_PAGES = 5

function pullPath(repository: string): string {
  return `${cnbRepositoryPath(repository)}/pulls`
}

function branchName(ref: string): string {
  return ref.replace(/^refs\/heads\//, '')
}

function reviewState(pr: Pull): HostedReviewInfo['state'] {
  if (pr.is_merged || pr.state === 'merged') {
    return 'merged'
  }
  return pr.state === 'open' && pr.is_wip ? 'draft' : pr.state
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

async function credential(): Promise<string> {
  const token = await getCnbCredentialToken()
  if (!token) {
    throw new Error('Connect CNB in Settings > Integrations.')
  }
  return token
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
  token: string
): Promise<HostedReviewInfo> {
  return {
    provider: 'cnb',
    number: pr.number,
    title: pr.title,
    state: reviewState(pr),
    url: `https://cnb.cool${pullPath(repository)}/${pr.number}`,
    updatedAt: pr.updated_at ?? pr.last_acted_at ?? pr.created_at ?? '',
    mergeable:
      pr.mergeable_state === 'mergeable'
        ? 'MERGEABLE'
        : pr.mergeable_state === 'conflict'
          ? 'CONFLICTING'
          : 'UNKNOWN',
    ...(pr.head.sha ? { headSha: pr.head.sha } : {}),
    baseRefName: branchName(pr.base.ref),
    ...(await readChecks(repository, pr, token))
  }
}

export async function getCnbReviewByNumber(
  repository: string,
  number: number
): Promise<HostedReviewInfo | null> {
  if (!Number.isSafeInteger(number) || number <= 0) {
    return null
  }
  const token = await credential()
  const response = await cnbRequest(`${pullPath(repository)}/${number}`, token)
  if (response.status === 404) {
    await response.body?.cancel()
    return null
  }
  requireOk(response)
  return hostedReview(repository, pull.parse(await response.json()), token)
}

export async function getCnbReviewForBranch(
  repository: string,
  branch: string,
  currentHeadOid: string | null | undefined
): Promise<HostedReviewInfo | null> {
  const token = await credential()
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
  return pr ? hostedReview(repository, pr, token) : null
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

export async function readCnbReviewDetails(value: unknown): Promise<CnbReviewDetails> {
  const target = typeof value === 'string' && value.length < 2048 ? parseCnbReviewUrl(value) : null
  if (!target) {
    throw new Error('Invalid CNB pull request URL.')
  }
  const token = await credential()
  const path = `${pullPath(target.repository)}/${target.number}`
  async function read(suffix: string, query?: Record<string, string>): Promise<unknown> {
    const response = await cnbRequest(path + suffix, token, query)
    requireOk(response)
    return response.json()
  }
  const [info, discussion, changes] = await Promise.all([
    read('').then((payload) => pull.parse(payload)),
    read('/comments', { page: '1', page_size: '20' }).then(
      (payload) => comments.parse(payload) ?? []
    ),
    read('/files').then((payload) => files.parse(payload) ?? [])
  ])
  let remainingPatchBudget = 240_000
  return {
    description: info.body?.slice(0, 32_000) ?? '',
    comments: discussion.slice(0, 20).map((comment) => ({
      id: comment.id,
      author: comment.author?.nickname || comment.author?.username || '',
      body: comment.body?.slice(0, 8_000) ?? ''
    })),
    files: changes.slice(0, 100).map((file) => {
      const patch = file.patch?.slice(0, Math.min(24_000, remainingPatchBudget)) || null
      remainingPatchBudget -= patch?.length ?? 0
      return {
        path: file.filename,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        patch,
        patchTruncated: typeof file.patch === 'string' && file.patch.length > (patch?.length ?? 0)
      }
    }),
    filesTruncated: changes.length > 100
  }
}
