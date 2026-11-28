import { z } from 'zod'
import { lazyZodSchema } from '../../shared/schema/lazy-zod-schema'
import type { CnbMember, CnbMemberListResult } from '../../shared/cnb/cnb-tasks'
import type { CnbRepositoryTarget } from './task-list'
import { cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import { credential } from './task-schema'

const MEMBER_PAGE_SIZE = 100
const MEMBER_MAX_PAGES = 5

export type CnbViewer = { username: string; nickname: string | null }

export async function readCnbViewer(): Promise<CnbViewer | null> {
  const token = await credential()
  if (!token) {
    return null
  }
  try {
    const response = await cnbRequest('/user', token)
    if (!response.ok) {
      await discardCnbBody(response)
      return null
    }
    const user = z
      .object({ username: z.string(), nickname: z.string().nullish() })
      .parse(await response.json())
    return { username: user.username, nickname: user.nickname ?? null }
  } catch {
    return null
  }
}

export async function readCnbLabels(repositories: CnbRepositoryTarget[]): Promise<string[]> {
  const token = await credential()
  if (!token) {
    return []
  }
  const names = new Set<string>()
  await Promise.all(
    repositories.map(async (repo) => {
      try {
        const response = await cnbRequest(`${cnbRepositoryPath(repo.slug)}/labels`, token, {
          page: '1',
          page_size: '100'
        })
        if (!response.ok) {
          await discardCnbBody(response)
          return
        }
        const rows = z
          .array(z.object({ name: z.string() }))
          .nullish()
          .parse(await response.json())
        for (const row of rows ?? []) {
          names.add(row.name)
        }
      } catch {
        // A repo without label access contributes nothing rather than failing the whole list.
      }
    })
  )
  return [...names].sort((a, b) => a.localeCompare(b))
}

const memberRow = lazyZodSchema(() =>
  z.object({
    username: z.string().nullish(),
    nickname: z.string().nullish()
  })
)

/**
 * Assignee/reviewer candidates from GET /{slug}/-/list-members (direct + inherited members).
 * Needs repo-manage:r; a 403 is reported so the picker keeps manual entry instead of hiding it.
 */
export async function readCnbMembers(repository: string): Promise<CnbMemberListResult> {
  const token = await credential()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  const members: CnbMember[] = []
  const seen = new Set<string>()
  let truncated = false
  for (let page = 1; page <= MEMBER_MAX_PAGES; page += 1) {
    try {
      const response = await cnbRequest(`${cnbRepositoryPath(repository)}/list-members`, token, {
        page: String(page),
        page_size: String(MEMBER_PAGE_SIZE)
      })
      if (response.status === 403 || response.status === 401) {
        await discardCnbBody(response)
        return { ok: false, reason: 'forbidden' }
      }
      if (!response.ok) {
        await discardCnbBody(response)
        return { ok: false, reason: 'request-failed' }
      }
      const rows =
        z
          .array(memberRow)
          .nullish()
          .parse(await response.json()) ?? []
      for (const row of rows) {
        const login = row.username?.trim()
        if (!login || seen.has(login)) {
          continue
        }
        seen.add(login)
        members.push({ login, nickname: row.nickname ?? null })
      }
      if (rows.length < MEMBER_PAGE_SIZE) {
        return { ok: true, members, truncated: false }
      }
      truncated = page === MEMBER_MAX_PAGES
    } catch {
      return { ok: false, reason: 'request-failed' }
    }
  }
  return { ok: true, members, truncated }
}
