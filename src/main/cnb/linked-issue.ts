import { parseCnbWorkItemUrl } from '../../shared/cnb/cnb-work-item-url'
import type { CnbDetailResult, CnbIssueDetail, CnbWriteResult } from '../../shared/cnb/cnb-tasks'
import { cnbRepositoryPath } from './repository-ref'
import { readCnbIssueRecord } from './task-detail'
import { credential } from './task-schema'
import { writeCnbIssue } from './task-writes'

async function readCnbIssueStatus(
  repository: string,
  number: number
): Promise<CnbDetailResult<Pick<CnbIssueDetail, 'title' | 'state'>>> {
  try {
    const token = await credential()
    if (!token) {
      return { ok: false, reason: 'not-connected' }
    }
    const result = await readCnbIssueRecord(
      `${cnbRepositoryPath(repository)}/issues/${number}`,
      token
    )
    if (!result.ok) {
      return result
    }
    if (result.detail.number !== number) {
      return { ok: false, reason: 'not-found' }
    }
    const { title, state } = result.detail
    return { ok: true, detail: { title, state } }
  } catch {
    return { ok: false, reason: 'request-failed' }
  }
}

export function readLinkedCnbIssue(url: string): ReturnType<typeof readCnbIssueStatus> {
  const issue = parseCnbWorkItemUrl(url)
  return issue?.type === 'issue'
    ? readCnbIssueStatus(issue.repository, issue.number)
    : Promise.resolve({ ok: false, reason: 'not-found' })
}

export async function closeLinkedCnbIssue(url: string): Promise<CnbWriteResult> {
  const issue = parseCnbWorkItemUrl(url)
  if (issue?.type !== 'issue') {
    return { ok: false, reason: 'not-found' }
  }
  const { repository, number } = issue
  const current = await readCnbIssueStatus(repository, number)
  if (!current.ok) {
    return current
  }
  if (current.detail.state === 'closed') {
    return { ok: true }
  }
  const updated = await writeCnbIssue(repository, number, { action: 'update', state: 'closed' })
  const verified = await readCnbIssueStatus(repository, number)
  if (verified.ok && verified.detail.state === 'closed') {
    return { ok: true }
  }
  return updated.ok ? { ok: false, reason: 'close-unconfirmed' } : updated
}
