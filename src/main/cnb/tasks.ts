import { z } from 'zod'
import type { CnbTaskItem, CnbTaskKind, CnbTaskPage } from '../../shared/cnb/cnb-tasks'
import { getCnbCredentialToken } from './credentials'
import { cnbHasNextPage, cnbRequest } from './request'
import { cnbRepositoryPath } from './repository-ref'

const PAGE_SIZE = 30
const taskRows = z
  .array(
    z.object({
      number: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .refine(Number.isSafeInteger),
      title: z.string(),
      state: z.enum(['open', 'closed', 'merged']),
      is_merged: z.boolean().optional(),
      updated_at: z.string().nullish(),
      created_at: z.string().nullish()
    })
  )
  .nullable()

export async function readCnbTaskPage(
  repository: string,
  kind: CnbTaskKind,
  page: number
): Promise<CnbTaskPage> {
  const token = await getCnbCredentialToken()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  const path = `${cnbRepositoryPath(repository)}/${kind === 'issues' ? 'issues' : 'pulls'}`
  try {
    const response = await cnbRequest(path, token, {
      page: String(page),
      page_size: String(PAGE_SIZE),
      order_by: '-updated_at',
      // CNB includes merged and unmerged PRs in its closed list.
      ...(kind === 'merged-prs' ? { state: 'closed' } : {})
    })
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      return { ok: false, reason: 'request-failed' }
    }
    const rows = taskRows.parse(await response.json()) ?? []
    const items: CnbTaskItem[] = []
    for (const row of rows) {
      const state = row.is_merged ? 'merged' : row.state
      if (kind === 'merged-prs' && state !== 'merged') {
        continue
      }
      items.push({
        number: row.number,
        title: row.title,
        state,
        updatedAt: row.updated_at ?? row.created_at ?? null,
        url: `https://cnb.cool${path}/${row.number}`
      })
    }
    return { ok: true, items, hasNextPage: cnbHasNextPage(response, page, PAGE_SIZE, rows.length) }
  } catch {
    return { ok: false, reason: 'request-failed' }
  }
}
