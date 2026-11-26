import { z } from 'zod'
import type {
  CnbListFilters,
  CnbListStateFilter,
  CnbSearchScope,
  CnbTaskListPage,
  CnbTaskRow,
  CnbTaskState
} from '../../shared/cnb/cnb-tasks'
import { cnbHasNextPage, cnbPageCount, cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import {
  PAGE_SIZE,
  SEARCH_MAX_PAGES,
  SEARCH_PAGE_SIZE,
  csv,
  displayName,
  mapMergeable,
  pullRow,
  pullWebUrl
} from './task-schema'

export function pullFiltersForState(filter: CnbListStateFilter): 'all' | 'open' | 'closed' {
  return filter === 'open' || filter === 'closed' ? filter : 'all'
}

async function fetchPullWindow(
  repository: string,
  filters: CnbListFilters,
  merged: 'all' | 'open' | 'closed',
  page: number,
  pageSize: number,
  token: string
): Promise<{ rows: z.output<typeof pullRow>[]; response: Response }> {
  const path = `${cnbRepositoryPath(repository)}/pulls`
  const query: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
    state: merged,
    order_by: '-updated_at'
  }
  const authors = csv(filters.authors)
  if (authors) {
    query.authors = authors
  }
  const assignees = csv(filters.assignees)
  if (assignees) {
    query.assignees = assignees
  }
  const reviewers = csv(filters.reviewers)
  if (reviewers) {
    query.reviewers = reviewers
  }
  const labels = csv(filters.labels)
  if (labels) {
    query.labels = labels
  }
  const response = await cnbRequest(path, token, query)
  if (!response.ok) {
    await discardCnbBody(response)
    throw new Error(`CNB pull requests request failed (HTTP ${response.status}).`)
  }
  return {
    rows:
      z
        .array(pullRow)
        .nullish()
        .parse(await response.json()) ?? [],
    response
  }
}

export async function readPullPage(
  repository: string,
  filters: CnbListFilters,
  page: number,
  token: string
): Promise<Extract<CnbTaskListPage, { ok: true }>> {
  if (!filters.keyword.trim()) {
    const { rows, response } = await fetchPullWindow(
      repository,
      filters,
      pullFiltersForState(filters.state),
      page,
      PAGE_SIZE,
      token
    )
    return {
      ok: true,
      items: rows.map((row) => pullRowToTask(repository, row)),
      page,
      hasNextPage: cnbHasNextPage(response, page, PAGE_SIZE, rows.length),
      pageCount: cnbPageCount(response, PAGE_SIZE),
      scope: null,
      failures: []
    }
  }
  // Keyword search: scan the state window newest-first, filter by title locally, report the scope.
  const keyword = filters.keyword.trim().toLowerCase()
  const merged = pullFiltersForState(filters.state)
  const skip = (page - 1) * SEARCH_PAGE_SIZE
  const collected: CnbTaskRow[] = []
  let scanned = 0
  let truncated = false
  let matchedBefore = 0
  for (let scanPage = 1; scanPage <= SEARCH_MAX_PAGES; scanPage++) {
    const { rows, response } = await fetchPullWindow(
      repository,
      filters,
      merged,
      scanPage,
      SEARCH_PAGE_SIZE,
      token
    )
    scanned = scanPage
    for (const row of rows) {
      if (!row.title.toLowerCase().includes(keyword)) {
        continue
      }
      if (matchedBefore < skip) {
        matchedBefore++
        continue
      }
      if (collected.length < SEARCH_PAGE_SIZE) {
        collected.push(pullRowToTask(repository, row))
      }
    }
    const hasMore = cnbHasNextPage(response, scanPage, SEARCH_PAGE_SIZE, rows.length)
    if (!hasMore) {
      break
    }
    if (scanPage === SEARCH_MAX_PAGES) {
      truncated = true
    }
  }
  const hasNextPage = collected.length >= SEARCH_PAGE_SIZE || truncated
  return {
    ok: true,
    items: collected,
    page,
    hasNextPage,
    pageCount: null,
    scope: { scannedPages: scanned, truncated } satisfies CnbSearchScope,
    failures: []
  }
}

export function pullRowToTask(repository: string, row: z.output<typeof pullRow>): CnbTaskRow {
  const state: CnbTaskState = row.is_merged || row.state === 'merged' ? 'merged' : row.state
  return {
    repoId: '',
    repoSlug: repository,
    number: row.number,
    title: row.title,
    url: pullWebUrl(repository, row.number),
    state,
    isDraft: state === 'open' && row.is_wip === true,
    author: row.author,
    assignees: (row.assignees ?? [])
      .map((entry) => displayName(entry))
      .filter((entry): entry is string => Boolean(entry)),
    labels: row.labels,
    reviewers: (row.reviewers ?? []).map((entry) => ({
      login: entry.login,
      reviewState: entry.reviewState
    })),
    checks: null,
    mergeable: mapMergeable(row.mergeable_state),
    updatedAt: row.updated_at ?? row.last_acted_at ?? row.created_at ?? null
  }
}
