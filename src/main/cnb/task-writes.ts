import { z } from 'zod'
import type {
  CnbIssueWrite,
  CnbPullWrite,
  CnbTaskFailureReason,
  CnbWriteResult
} from '../../shared/cnb/cnb-tasks'
import { cnbRequest, discardCnbBody, type CnbRequestOptions } from './request'
import { cnbRepositoryPath } from './repository-ref'
import { credential } from './task-schema'

function writeFailure(error: unknown): CnbWriteResult {
  return { ok: false, reason: error instanceof Error ? error.message : 'Request failed.' }
}

export async function mergeCnbPull(
  path: string,
  token: string,
  style: Extract<CnbPullWrite, { action: 'merge' }>['style'],
  title?: string,
  message?: string
): Promise<CnbWriteResult> {
  try {
    const response = await cnbRequest(`${path}/merge`, token, undefined, {
      method: 'PUT',
      body: {
        merge_style: style,
        ...(title ? { commit_title: title } : {}),
        ...(message ? { commit_message: message } : {})
      },
      timeoutMs: 25_000
    })
    const result = z
      .object({
        merged: z.boolean().optional(),
        message: z.string().optional(),
        errmsg: z.string().optional()
      })
      .safeParse(await response.json().catch(() => null))
    if (response.ok && result.success && result.data.merged === true) {
      return { ok: true }
    }
    return {
      ok: false,
      reason:
        (result.success && (result.data.errmsg || result.data.message)?.slice(0, 500)) ||
        (response.ok
          ? 'CNB did not confirm the merge. Refresh the pull request.'
          : `CNB rejected the merge (HTTP ${response.status}).`)
    }
  } catch {
    return {
      ok: false,
      reason:
        'The CNB merge result could not be confirmed. Refresh the pull request before retrying.'
    }
  }
}

async function write(
  path: string,
  token: string,
  options: CnbRequestOptions
): Promise<CnbWriteResult> {
  try {
    const response = await cnbRequest(path, token, undefined, options)
    if (!response.ok) {
      await discardCnbBody(response)
      return { ok: false, reason: `HTTP ${response.status}` }
    }
    await discardCnbBody(response)
    return { ok: true }
  } catch (error) {
    return writeFailure(error)
  }
}

function issueWriteResult(failed: CnbTaskFailureReason | 'not-found'): CnbWriteResult {
  return { ok: false, reason: failed }
}

async function writeIssueProperty(
  path: string,
  token: string,
  key: string,
  value: string
): Promise<CnbWriteResult> {
  try {
    const response = await cnbRequest(path, token, undefined, {
      method: 'PATCH',
      body: { properties: [{ key, value }] }
    })
    if (!response.ok) {
      await discardCnbBody(response)
      return { ok: false, reason: `HTTP ${response.status}` }
    }
    const result = z.object({ success_count: z.number().optional() }).parse(await response.json())
    return result.success_count === 1 ? { ok: true } : { ok: false, reason: 'property-rejected' }
  } catch (error) {
    return writeFailure(error)
  }
}

export async function writeCnbIssue(
  repository: string,
  number: number | null,
  payload: CnbIssueWrite
): Promise<CnbWriteResult> {
  const token = await credential()
  if (!token) {
    return issueWriteResult('not-connected')
  }
  const base = `${cnbRepositoryPath(repository)}/issues`
  switch (payload.action) {
    case 'create':
      return write(base, token, {
        method: 'POST',
        body: {
          title: payload.title,
          ...(payload.body ? { body: payload.body } : {}),
          ...(payload.labels.length > 0 ? { labels: payload.labels } : {}),
          ...(payload.assignees.length > 0 ? { assignees: payload.assignees } : {})
        }
      })
    case 'update': {
      if (number === null) {
        return issueWriteResult('not-found')
      }
      return write(`${base}/${number}`, token, {
        method: 'PATCH',
        body: {
          ...(payload.title !== undefined ? { title: payload.title } : {}),
          ...(payload.body !== undefined ? { body: payload.body } : {}),
          ...(payload.state
            ? {
                state: payload.state,
                state_reason: payload.state === 'closed' ? 'completed' : 'reopened'
              }
            : {})
        }
      })
    }
    case 'comment':
      if (number === null) {
        return issueWriteResult('not-found')
      }
      return write(`${base}/${number}/comments`, token, {
        method: 'POST',
        body: { body: payload.body }
      })
    case 'labels':
      if (number === null) {
        return issueWriteResult('not-found')
      }
      return write(`${base}/${number}/labels`, token, {
        method: 'PUT',
        body: { labels: payload.labels }
      })
    case 'assignees': {
      if (number === null) {
        return issueWriteResult('not-found')
      }
      const assignees = [...new Set(payload.assignees.map((login) => login.trim()).filter(Boolean))]
      return write(`${base}/${number}/assignees`, token, {
        method: 'PATCH',
        body: { assignees }
      })
    }
    case 'property':
      return number === null
        ? issueWriteResult('not-found')
        : writeIssueProperty(`${base}/${number}/property`, token, payload.key, payload.value)
  }
}

/** Replaces the reviewer set (POST adds, DELETE removes) so removals take effect. */
async function replaceReviewers(
  pullPath: string,
  reviewersPath: string,
  token: string,
  desired: string[]
): Promise<CnbWriteResult> {
  let current: string[] | null = null
  try {
    const response = await cnbRequest(pullPath, token)
    if (response.ok) {
      const pull = z
        .object({
          reviewers: z
            .array(
              z.object({
                user: z.object({ username: z.string().nullish() }).nullish()
              })
            )
            .nullish()
        })
        .parse(await response.json())
      current = (pull.reviewers ?? [])
        .map((entry) => entry.user?.username ?? '')
        .filter((login): login is string => Boolean(login))
    } else {
      await discardCnbBody(response)
    }
  } catch {
    current = null
  }
  if (current === null) {
    return { ok: false, reason: 'request-failed' }
  }
  const desiredSet = new Set(desired.map((login) => login.trim()).filter(Boolean))
  const currentSet = new Set(current)
  const toAdd = [...desiredSet].filter((login) => !currentSet.has(login))
  const toRemove = [...currentSet].filter((login) => !desiredSet.has(login))
  if (toAdd.length > 0) {
    const added = await write(reviewersPath, token, { method: 'POST', body: { reviewers: toAdd } })
    if (!added.ok) {
      return added
    }
  }
  if (toRemove.length > 0) {
    const removed = await write(reviewersPath, token, {
      method: 'DELETE',
      body: { reviewers: toRemove }
    })
    if (!removed.ok) {
      return removed
    }
  }
  return { ok: true }
}

export async function writeCnbPull(
  repository: string,
  number: number,
  payload: CnbPullWrite
): Promise<CnbWriteResult> {
  const token = await credential()
  if (!token) {
    return issueWriteResult('not-connected')
  }
  const base = `${cnbRepositoryPath(repository)}/pulls/${number}`
  switch (payload.action) {
    case 'update':
      return write(base, token, {
        method: 'PATCH',
        body: {
          ...(payload.title !== undefined ? { title: payload.title } : {}),
          ...(payload.body !== undefined ? { body: payload.body } : {}),
          ...(payload.state ? { state: payload.state } : {})
        }
      })
    case 'comment':
      return write(`${base}/comments`, token, {
        method: 'POST',
        body: { body: payload.body }
      })
    case 'reviewers':
      return replaceReviewers(base, `${base}/reviewers`, token, payload.reviewers)
    case 'labels':
      return write(`${base}/labels`, token, {
        method: 'PUT',
        body: { labels: payload.labels }
      })
    case 'review':
      return write(`${base}/reviews`, token, {
        method: 'POST',
        body: { event: payload.event, body: payload.body }
      })
    case 'merge':
      return mergeCnbPull(base, token, payload.style, payload.title, payload.message)
  }
}
