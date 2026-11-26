import { z } from 'zod'
import type {
  CnbListFilters,
  CnbTaskKind,
  CnbTaskListPage,
  CnbTaskRepository,
  CnbTaskRow,
  CnbSearchScope
} from '../../shared/cnb/cnb-tasks'
import { cnbHasNextPage, cnbPageCount, cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import {
  PAGE_SIZE,
  SEARCH_PAGE_SIZE,
  credential,
  csv,
  displayName,
  issueRow,
  issueWebUrl,
  stateParam
} from './task-schema'
import { readPullPage } from './task-pull-list'

export type CnbRepositoryTarget = CnbTaskRepository

/** Issues support a real server-side keyword param. */
function issueQuery(
  filters: CnbListFilters,
  page: number,
  pageSize: number
): Record<string, string> {
  const query: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
    order_by: '-updated_at'
  }
  const state = stateParam(filters.state)
  if (state) {
    query.state = state
  }
  if (filters.keyword.trim()) {
    query.keyword = filters.keyword.trim()
  }
  const authors = csv(filters.authors)
  if (authors) {
    query.authors = authors
  }
  const assignees = csv(filters.assignees)
  if (assignees) {
    query.assignees = assignees
  }
  const labels = csv(filters.labels)
  if (labels) {
    query.labels = labels
  }
  return query
}

async function readIssuePage(
  repository: string,
  filters: CnbListFilters,
  page: number,
  token: string
): Promise<Extract<CnbTaskListPage, { ok: true }>> {
  const path = `${cnbRepositoryPath(repository)}/issues`
  const pageSize = filters.keyword.trim() ? SEARCH_PAGE_SIZE : PAGE_SIZE
  const response = await cnbRequest(path, token, issueQuery(filters, page, pageSize))
  if (!response.ok) {
    await discardCnbBody(response)
    throw new Error(`CNB issues request failed (HTTP ${response.status}).`)
  }
  const rows =
    z
      .array(issueRow)
      .nullish()
      .parse(await response.json()) ?? []
  const items: CnbTaskRow[] = rows.map((row) => ({
    repoId: '',
    repoSlug: repository,
    number: row.number,
    title: row.title,
    url: issueWebUrl(repository, row.number),
    state: row.state,
    isDraft: false,
    author: row.author,
    assignees: (row.assignees ?? [])
      .map((entry) => displayName(entry))
      .filter((entry): entry is string => Boolean(entry)),
    labels: row.labels,
    reviewers: [],
    checks: null,
    mergeable: null,
    updatedAt: row.updated_at ?? row.last_acted_at ?? row.created_at ?? null
  }))
  return {
    ok: true,
    items,
    page,
    hasNextPage: cnbHasNextPage(response, page, pageSize, rows.length),
    pageCount: cnbPageCount(response, pageSize),
    scope: null,
    failures: []
  }
}

/** One page across every selected repository, numbered together and stable-sorted by update time. */
export async function readCnbTaskList(args: {
  repositories: CnbRepositoryTarget[]
  kind: CnbTaskKind
  filters: CnbListFilters
  page: number
}): Promise<CnbTaskListPage> {
  const token = await credential()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  if (args.repositories.length === 0) {
    return { ok: false, reason: 'repositories-unavailable' }
  }
  const failures: { repoId: string; repoSlug: string; message: string }[] = []
  const settled = await Promise.all(
    args.repositories.map(async (repo) => {
      try {
        const page =
          args.kind === 'issues'
            ? await readIssuePage(repo.slug, args.filters, args.page, token)
            : await readPullPage(repo.slug, args.filters, args.page, token)
        return { repo, page }
      } catch (error) {
        failures.push({
          repoId: repo.id,
          repoSlug: repo.slug,
          message: error instanceof Error ? error.message : 'Request failed.'
        })
        return null
      }
    })
  )
  const succeeded = settled.filter(
    (entry): entry is { repo: CnbRepositoryTarget; page: Extract<CnbTaskListPage, { ok: true }> } =>
      entry !== null
  )
  if (succeeded.length === 0) {
    return { ok: false, reason: 'request-failed' }
  }
  const items: CnbTaskRow[] = []
  for (const { repo, page } of succeeded) {
    for (const item of page.items) {
      items.push({ ...item, repoId: repo.id })
    }
  }
  items.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const hasNextPage = succeeded.some((entry) => entry.page.hasNextPage)
  const pageCounts: number[] = []
  for (const entry of succeeded) {
    if (entry.page.pageCount === null) {
      pageCounts.length = 0
      break
    }
    pageCounts.push(entry.page.pageCount)
  }
  const pageCount = pageCounts.length > 0 ? Math.max(...pageCounts) : null
  const scopes = succeeded
    .map((entry) => entry.page.scope)
    .filter((scope): scope is CnbSearchScope => scope !== null)
  const scope =
    scopes.length > 0
      ? {
          scannedPages: Math.max(...scopes.map((entry) => entry.scannedPages)),
          truncated: scopes.some((entry) => entry.truncated)
        }
      : null
  return { ok: true, items, page: args.page, hasNextPage, pageCount, scope, failures }
}
