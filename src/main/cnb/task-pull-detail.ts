import { z } from 'zod'
import type {
  CnbComment,
  CnbDetailResult,
  CnbPullCommit,
  CnbPullDetail,
  CnbPullFile,
  CnbTaskState
} from '../../shared/cnb/cnb-tasks'
import { cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import { commentRow, toComments } from './task-detail'
import {
  MAX_COMMENTS,
  MAX_DETAIL_COMMITS,
  MAX_DETAIL_FILES,
  commitStatusMap,
  credential,
  displayName,
  labelArray,
  mapMergeable,
  numberField,
  pullWebUrl,
  reviewState,
  reviewerList,
  summarizeChecks
} from './task-schema'

/** Parsed PR head/base/reviewers; shared by the detail reader and the row checks reader. */
export const pullHeadSchema = z.object({
  number: numberField,
  title: z.string(),
  body: z.string().nullish(),
  state: reviewState,
  is_merged: z.boolean().optional(),
  is_wip: z.boolean().optional(),
  mergeable_state: z.string().nullish(),
  author: z.object({ username: z.string().nullish(), nickname: z.string().nullish() }).nullish(),
  head: z
    .object({ ref: z.string().nullish(), sha: z.string().nullish() })
    .nullish()
    .transform((value) => (value?.ref ? { ref: value.ref, sha: value.sha ?? null } : null)),
  base: z
    .object({ ref: z.string().nullish() })
    .nullish()
    .transform((value) => (value?.ref ? { ref: value.ref } : null)),
  reviewers: reviewerList,
  labels: labelArray,
  updated_at: z.string().nullish()
})

const fileRow = z.object({
  filename: z.string(),
  additions: z.number().nullish(),
  deletions: z.number().nullish(),
  patch: z.string().nullish()
})

const commitRow = z.object({
  sha: z.string(),
  author: z.object({ username: z.string().nullish(), nickname: z.string().nullish() }).nullish(),
  commit: z
    .object({
      message: z.string().nullish(),
      author: z.object({ date: z.string().nullish() }).nullish()
    })
    .nullish()
})

const reviewRow = z.object({
  id: z.string(),
  state: z.string().nullish(),
  body: z.string().nullish(),
  author: z.object({ username: z.string().nullish(), nickname: z.string().nullish() }).nullish()
})

function branchName(ref: string | null | undefined): string {
  return (ref ?? '').replace(/^refs\/heads\//, '')
}

export async function readCnbPullDetail(
  repository: string,
  number: number
): Promise<CnbDetailResult<CnbPullDetail>> {
  const token = await credential()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  const auth = token
  const base = `${cnbRepositoryPath(repository)}/pulls/${number}`
  const infoResponse = await cnbRequest(base, auth)
  if (infoResponse.status === 404) {
    await discardCnbBody(infoResponse)
    return { ok: false, reason: 'not-found' }
  }
  if (!infoResponse.ok) {
    await discardCnbBody(infoResponse)
    return { ok: false, reason: 'request-failed' }
  }
  const info = pullHeadSchema.parse(await infoResponse.json())
  const headSha = info.head?.sha ?? null
  async function read(path: string, query?: Record<string, string>): Promise<unknown> {
    const response = await cnbRequest(base + path, auth, query)
    if (!response.ok) {
      await discardCnbBody(response)
      throw new Error(`CNB request failed (HTTP ${response.status}).`)
    }
    return response.json()
  }
  const [comments, files, commits, reviews, statuses] = await Promise.all([
    read('/comments', { page: '1', page_size: String(MAX_COMMENTS) })
      .then((payload) => toComments(z.array(commentRow).nullish().parse(payload) ?? []))
      .catch((): CnbComment[] => []),
    read('/files')
      .then((payload) => z.array(fileRow).nullish().parse(payload) ?? [])
      .catch((): z.output<typeof fileRow>[] => []),
    read('/commits', { page: '1', page_size: String(MAX_DETAIL_COMMITS) })
      .then((payload) => z.array(commitRow).nullish().parse(payload) ?? [])
      .catch((): z.output<typeof commitRow>[] => []),
    read('/reviews', { page: '1', page_size: '50' })
      .then((payload) => z.array(reviewRow).nullish().parse(payload) ?? [])
      .catch((): z.output<typeof reviewRow>[] => []),
    read('/commit-statuses')
      .then((payload) => commitStatusMap.parse(payload))
      .catch(() => null)
  ])
  const checks = summarizeChecks(statuses, headSha)
  let remainingPatchBudget = 240_000
  const mappedFiles: CnbPullFile[] = files.slice(0, MAX_DETAIL_FILES).map((file) => {
    const patch = file.patch?.slice(0, Math.min(24_000, remainingPatchBudget)) || null
    remainingPatchBudget -= patch?.length ?? 0
    return {
      path: file.filename,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      patch,
      patchTruncated: typeof file.patch === 'string' && file.patch.length > (patch?.length ?? 0)
    }
  })
  const mappedCommits: CnbPullCommit[] = commits.slice(0, MAX_DETAIL_COMMITS).map((commit) => ({
    sha: commit.sha,
    message: commit.commit?.message?.split('\n')[0] ?? '',
    author: displayName(commit.author),
    committedAt: commit.commit?.author?.date ?? null
  }))
  const state: CnbTaskState = info.is_merged || info.state === 'merged' ? 'merged' : info.state
  return {
    ok: true,
    detail: {
      number: info.number,
      title: info.title,
      body: info.body ?? '',
      state,
      isDraft: state === 'open' && info.is_wip === true,
      author: displayName(info.author),
      headRef: branchName(info.head?.ref),
      baseRef: branchName(info.base?.ref),
      headSha,
      reviewers: (info.reviewers ?? []).map((entry) => ({
        login: entry.login,
        reviewState: entry.reviewState
      })),
      labels: info.labels,
      checks: checks.status,
      checksSummary: checks.summary
        ? {
            total: checks.summary.total,
            passed: checks.summary.passed,
            failed: checks.summary.failed,
            pending: checks.summary.pending
          }
        : null,
      mergeable: mapMergeable(info.mergeable_state),
      comments,
      reviews: reviews.slice(0, 50).map((review) => ({
        id: review.id,
        author: displayName(review.author) ?? '',
        state: review.state ?? 'commented',
        body: review.body ?? ''
      })),
      files: mappedFiles,
      filesTruncated: files.length > MAX_DETAIL_FILES,
      commits: mappedCommits,
      url: pullWebUrl(repository, info.number),
      updatedAt: info.updated_at ?? null
    }
  }
}
