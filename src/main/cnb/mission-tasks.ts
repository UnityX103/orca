import { z } from 'zod'
import type {
  CnbMissionField,
  CnbMissionListResult,
  CnbMissionResource,
  CnbMissionResourcePage,
  CnbMissionSelector,
  CnbMissionSort,
  CnbMissionViewConfig,
  CnbMissionViewType,
  CnbTaskState
} from '../../shared/cnb/cnb-tasks'
import { cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import { credential, displayName, pullWebUrl } from './task-schema'
import type { missionIssueResource, missionPullResource } from './mission-schema'
import {
  missionFieldRow,
  missionResources,
  missionRow,
  missionViewConfigRow,
  missionViewRow,
  tokenIntrospection
} from './mission-schema'

const MISSION_RESOURCE_SCOPES = ['mission-manage:r', 'mission-manage:rw'] as const

function missionViewType(value: string): CnbMissionViewType {
  return value === 'board' || value === 'gantt' ? value : 'table'
}

/** The token can only query mission resources with an explicit mission-manage scope. */
async function tokenCanQueryMissions(token: string): Promise<boolean> {
  try {
    const response = await cnbRequest('/user/token/introspect', token)
    if (!response.ok) {
      await discardCnbBody(response)
      return false
    }
    const introspected = tokenIntrospection.parse(await response.json())
    const scopes = new Set(introspected.scopes ?? [])
    return MISSION_RESOURCE_SCOPES.some((scope) => scopes.has(scope))
  } catch {
    return false
  }
}

export async function readCnbMissions(org: string): Promise<CnbMissionListResult> {
  const token = await credential()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  let response: Response
  try {
    response = await cnbRequest(`/${encodeURIComponent(org)}/-/missions`, token, {
      page: '1',
      page_size: '100',
      order_by: 'created_at',
      descendant: 'all'
    })
  } catch {
    return { ok: false, reason: 'request-failed' }
  }
  if (!response.ok) {
    await discardCnbBody(response)
    return { ok: false, reason: response.status === 403 ? 'forbidden' : 'request-failed' }
  }
  let rows: z.output<typeof missionRow>[]
  try {
    rows =
      z
        .array(missionRow)
        .nullish()
        .parse(await response.json()) ?? []
  } catch {
    return { ok: false, reason: 'request-failed' }
  }
  const canQueryResources = await tokenCanQueryMissions(token)
  return {
    ok: true,
    canQueryResources,
    missions: rows.map((row) => ({
      org,
      path: row.path,
      name: row.name,
      description: row.description ?? '',
      visibility: row.visibility_level ?? null
    }))
  }
}

function missionPullState(
  isMerged: boolean | null | undefined,
  state: string | null | undefined
): CnbTaskState {
  if (isMerged || state === 'merged') {
    return 'merged'
  }
  return state === 'closed' ? 'closed' : 'open'
}

export function encodeMissionPath(missionPath: string): string {
  return missionPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function missionState(
  row: z.output<typeof missionIssueResource> | z.output<typeof missionPullResource>
): CnbTaskState {
  if ('is_merged' in row) {
    return missionPullState(row.is_merged, row.state)
  }
  return row.state === 'closed' ? 'closed' : 'open'
}

/**
 * Loads one mission's views, fields and one resource page. Views/fields are fetched first so
 * they still surface when the resource query is refused (403) or fails.
 */
export async function readCnbMissionResources(args: {
  missionPath: string
  cursor: string | null
  view?: { selector: CnbMissionSelector[]; sort: CnbMissionSort[]; fields: string[] } | null
}): Promise<CnbMissionResourcePage> {
  const token = await credential()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  const auth = token
  const missionPath = encodeMissionPath(args.missionPath)
  const [viewsResult, fieldsResult] = await Promise.all([
    cnbRequest(`/${missionPath}/-/mission/view-list`, auth)
      .then(async (response) =>
        response.ok
          ? (missionViewRow
              .array()
              .nullish()
              .parse(await response.json()) ?? [])
          : []
      )
      .catch(() => []),
    cnbRequest(`/${missionPath}/-/mission-resource/fields`, auth, { type: 'issues' })
      .then(async (response) =>
        response.ok
          ? (missionFieldRow
              .array()
              .nullish()
              .parse(await response.json()) ?? [])
          : []
      )
      .catch(() => [])
  ])
  const views = viewsResult.map((row) => ({
    id: row.id,
    name: row.name,
    type: missionViewType(row.type)
  }))
  const fields = fieldsResult.map((row): CnbMissionField => ({
    name: row.name,
    interactionType:
      row.interaction_type === 'radio' ||
      row.interaction_type === 'checkbox' ||
      row.interaction_type === 'time_selector'
        ? row.interaction_type
        : null,
    operators: row.operators ?? [],
    values: (row.value ?? []).map((value) => String(value))
  }))
  const query: Record<string, string> = {}
  if (args.cursor) {
    query.cursor = args.cursor
  }
  // Replay a saved view config so the view actually scopes the rows it shows.
  const body = {
    selectors: args.view?.selector ?? [],
    ...(args.view?.fields?.length ? { fields: args.view.fields } : {})
  }
  let resources: z.output<typeof missionResources>
  try {
    const response = await cnbRequest(`/${missionPath}/-/mission-resource/resources`, auth, query, {
      method: 'POST',
      body
    })
    if (!response.ok) {
      await discardCnbBody(response)
      return {
        ok: true,
        views,
        fields,
        resources: [],
        nextCursor: null,
        total: 0,
        resourcesError: response.status === 403 ? 'forbidden' : 'request-failed'
      }
    }
    resources = missionResources.parse(await response.json())
  } catch {
    return {
      ok: true,
      views,
      fields,
      resources: [],
      nextCursor: null,
      total: 0,
      resourcesError: 'request-failed'
    }
  }
  const mapped: CnbMissionResource[] = []
  for (const row of resources.issues ?? []) {
    mapped.push({
      kind: 'issue',
      repoSlug: row.repo_slug,
      number: row.number,
      title: row.title,
      state: missionState(row),
      url: `https://cnb.cool${cnbRepositoryPath(row.repo_slug)}/issues/${row.number}`,
      author: displayName(row.author),
      assignees: (row.assignees ?? [])
        .map((entry) => displayName(entry))
        .filter((entry): entry is string => Boolean(entry)),
      priority: row.priority ?? null,
      labels: row.labels,
      updatedAt: row.updated_at ?? null
    })
  }
  for (const row of resources.pull_requests ?? []) {
    mapped.push({
      kind: 'pull-request',
      repoSlug: row.repo_slug,
      number: row.number,
      title: row.title,
      state: missionState(row),
      url: pullWebUrl(row.repo_slug, row.number),
      author: displayName(row.author),
      assignees: (row.assignees ?? [])
        .map((entry) => displayName(entry))
        .filter((entry): entry is string => Boolean(entry)),
      priority: null,
      labels: row.labels,
      updatedAt: row.updated_at ?? null
    })
  }
  return {
    ok: true,
    views,
    fields,
    resources: mapped,
    nextCursor: resources.next_cursor || null,
    total: resources.total ?? mapped.length,
    resourcesError: null
  }
}

/** A view's saved selectors/sorts/fields, replayed to scope the resource query. */
export async function readCnbMissionViewConfig(
  missionPath: string,
  viewId: string
): Promise<CnbMissionViewConfig | null> {
  const token = await credential()
  if (!token) {
    return null
  }
  try {
    const response = await cnbRequest(`/${encodeMissionPath(missionPath)}/-/mission/view`, token, {
      id: viewId
    })
    if (!response.ok) {
      await discardCnbBody(response)
      return null
    }
    const config = missionViewConfigRow.parse(await response.json())
    return {
      id: config.id,
      selector: (config.selectors ?? []).map((selector) => ({
        field: selector.field,
        operator: selector.operator,
        value: selector.value ?? []
      })),
      sort: (config.sorts ?? []).map((sort) => ({
        field: sort.field,
        order: sort.order === 'desc' ? 'desc' : 'asc'
      })),
      fields: (config.fields ?? []).map((field) => field.field)
    }
  } catch {
    return null
  }
}
