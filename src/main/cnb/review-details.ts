import { z } from 'zod'
import { lazyZodSchema } from '../../shared/schema/lazy-zod-schema'
import type { CnbReviewDetails } from '../../shared/cnb/cnb-review-details'
import { requireCnbCredentialToken } from './credentials'
import { pullPath, readCnbPull } from './pull-requests'
import { cnbRequest, discardCnbBody } from './request'
import { parseCnbReviewUrl } from './repository-ref'

const comments = lazyZodSchema(() =>
  z
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
)
const files = lazyZodSchema(() =>
  z
    .array(
      z.object({
        filename: z.string(),
        additions: z.number().nullish(),
        deletions: z.number().nullish(),
        patch: z.string().nullish()
      })
    )
    .nullable()
)

export async function readCnbReviewDetails(value: unknown): Promise<CnbReviewDetails> {
  const target = typeof value === 'string' && value.length < 2048 ? parseCnbReviewUrl(value) : null
  if (!target) {
    throw new Error('Invalid CNB pull request URL.')
  }
  const token = await requireCnbCredentialToken()
  const path = `${pullPath(target.repository)}/${target.number}`
  async function read(suffix: string, query?: Record<string, string>): Promise<unknown> {
    const response = await cnbRequest(path + suffix, token, query)
    if (!response.ok) {
      await discardCnbBody(response)
      throw new Error(`CNB PR lookup failed (HTTP ${response.status}).`)
    }
    return response.json()
  }
  const [info, discussion, changes] = await Promise.all([
    readCnbPull(target.repository, target.number, token),
    read('/comments', { page: '1', page_size: '20' }).then(
      (payload) => comments.parse(payload) ?? []
    ),
    read('/files').then((payload) => files.parse(payload) ?? [])
  ])
  if (!info) {
    throw new Error('The CNB pull request is no longer available.')
  }
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
