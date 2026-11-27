import { z } from 'zod'
import type { CnbComment, CnbDetailResult, CnbIssueDetail } from '../../shared/cnb/cnb-tasks'
import { cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import {
  MAX_COMMENTS,
  credential,
  displayName,
  issueWebUrl,
  labelArray,
  numberField
} from './task-schema'

const issueDetail = z.object({
  number: numberField,
  title: z.string(),
  body: z.string().nullish(),
  state: z.enum(['open', 'closed']),
  author: z.object({ username: z.string().nullish(), nickname: z.string().nullish() }).nullish(),
  assignees: z
    .array(z.object({ username: z.string().nullish(), nickname: z.string().nullish() }))
    .nullish(),
  labels: labelArray,
  updated_at: z.string().nullish()
})

const issueProperty = z.object({
  key: z.string(),
  name: z.string().nullish(),
  value: z.string().nullish()
})

async function readIssueProperties(path: string, token: string) {
  try {
    const response = await cnbRequest(path, token)
    if (!response.ok) {
      await discardCnbBody(response)
      return []
    }
    const values =
      z
        .array(issueProperty)
        .nullish()
        .parse(await response.json()) ?? []
    return values.map(({ key, name, value }) => ({ key, name: name || key, value: value ?? '' }))
  } catch {
    return []
  }
}

export const commentRow = z.object({
  id: z.string(),
  body: z.string().nullish(),
  author: z.object({ username: z.string().nullish(), nickname: z.string().nullish() }).nullish(),
  created_at: z.string().nullish()
})

export async function readCnbIssueRecord(
  path: string,
  token: string
): Promise<CnbDetailResult<z.output<typeof issueDetail>>> {
  const response = await cnbRequest(path, token)
  if (response.ok) {
    return { ok: true, detail: issueDetail.parse(await response.json()) }
  }
  await discardCnbBody(response)
  return { ok: false, reason: response.status === 404 ? 'not-found' : 'request-failed' }
}

export function toComments(rows: z.output<typeof commentRow>[]): CnbComment[] {
  return rows.slice(0, MAX_COMMENTS).map((row) => ({
    id: row.id,
    author: displayName(row.author) ?? '',
    body: row.body ?? '',
    createdAt: row.created_at ?? null
  }))
}

export async function readCnbIssueDetail(
  repository: string,
  number: number
): Promise<CnbDetailResult<CnbIssueDetail>> {
  const token = await credential()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  const base = `${cnbRepositoryPath(repository)}/issues/${number}`
  const record = await readCnbIssueRecord(base, token)
  if (!record.ok) {
    return record
  }
  const info = record.detail
  const properties = readIssueProperties(`${base}/property`, token)
  let comments: CnbComment[] = []
  try {
    const response = await cnbRequest(`${base}/comments`, token, {
      page: '1',
      page_size: String(MAX_COMMENTS),
      sort: 'created'
    })
    if (response.ok) {
      comments = toComments(
        z
          .array(commentRow)
          .nullish()
          .parse(await response.json()) ?? []
      )
    } else {
      await discardCnbBody(response)
    }
  } catch {
    comments = []
  }
  return {
    ok: true,
    detail: {
      number: info.number,
      title: info.title,
      body: info.body ?? '',
      state: info.state,
      author: displayName(info.author),
      assignees: (info.assignees ?? [])
        .map((entry) => entry.username ?? null)
        .filter((entry): entry is string => Boolean(entry)),
      labels: info.labels,
      properties: await properties,
      comments,
      url: issueWebUrl(repository, info.number),
      updatedAt: info.updated_at ?? null,
      canEdit: true
    }
  }
}
