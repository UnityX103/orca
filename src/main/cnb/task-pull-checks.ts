import type { CnbPullChecksResult } from '../../shared/cnb/cnb-tasks'
import { cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import { commitStatusMap, credential, summarizeChecks } from './task-schema'
import { pullHeadSchema } from './task-pull-detail'

async function readPullHead(
  base: string,
  token: string
): Promise<
  | { ok: true; headSha: string | null }
  | { ok: false; reason: 'not-found' | 'forbidden' | 'request-failed' }
> {
  const response = await cnbRequest(base, token)
  if (!response.ok) {
    await discardCnbBody(response)
    return {
      ok: false,
      reason:
        response.status === 404
          ? 'not-found'
          : response.status === 401 || response.status === 403
            ? 'forbidden'
            : 'request-failed'
    }
  }
  const info = pullHeadSchema.parse(await response.json())
  return { ok: true, headSha: info.head?.sha ?? null }
}

/**
 * Row-level checks for the list's Checks column; list rows carry only `checks: null`.
 * The official `/pulls/{n}/commit-statuses` body is one object; `commitStatusMap` also accepts the
 * history array. 401/403 and malformed bodies are errors, not an empty "no checks" result.
 */
export async function readCnbPullChecks(
  repository: string,
  number: number
): Promise<CnbPullChecksResult> {
  const token = await credential()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  const base = `${cnbRepositoryPath(repository)}/pulls/${number}`
  try {
    const [headResult, statusResponse] = await Promise.all([
      readPullHead(base, token),
      cnbRequest(`${base}/commit-statuses`, token)
    ])
    if (!headResult.ok) {
      await discardCnbBody(statusResponse)
      return headResult
    }
    if (statusResponse.status === 401 || statusResponse.status === 403) {
      await discardCnbBody(statusResponse)
      return { ok: false, reason: 'forbidden' }
    }
    if (!statusResponse.ok) {
      await discardCnbBody(statusResponse)
      return { ok: false, reason: 'request-failed' }
    }
    const parsedStatuses = commitStatusMap.safeParse(await statusResponse.json())
    if (!parsedStatuses.success) {
      return { ok: false, reason: 'request-failed' }
    }
    const checks = summarizeChecks(parsedStatuses.data, headResult.headSha)
    return {
      ok: true,
      checks: checks.status,
      summary: checks.summary
        ? {
            total: checks.summary.total,
            passed: checks.summary.passed,
            failed: checks.summary.failed,
            pending: checks.summary.pending
          }
        : null
    }
  } catch {
    return { ok: false, reason: 'request-failed' }
  }
}
