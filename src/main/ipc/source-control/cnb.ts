import { ipcMain } from 'electron'
import { z } from 'zod'
import type { CnbMission, CnbTaskRepository } from '../../../shared/cnb/cnb-tasks'
import { mapSettledWithConcurrency } from '../../../shared/concurrency/map-with-concurrency'
import { isGitRepoKind } from '../../../shared/repository/repo-kind'
import type { Repo } from '../../../shared/repository/repo-types'
import { getTaskEligibleRepos } from '../../../shared/work-items/task-repo-selection'
import { connectCnb, disconnectCnb, getCnbCredentialStatus } from '../../cnb/credentials'
import { cnbForgeProvider } from '../../cnb/forge-provider'
import {
  readCnbIssueDetail,
  readCnbLabels,
  readCnbMissionResources,
  readCnbMissionViewConfig,
  readCnbMissions,
  readCnbViewer,
  readCnbPullDetail,
  readCnbTaskList,
  uploadCnbAttachment,
  writeCnbIssue,
  writeCnbPull
} from '../../cnb/tasks'
import type { Store } from '../../persistence/loading-store/store'
import { getLocalProjectWorktreeGitOptions } from '../../workspaces/execution-host/project-runtime-git-options'
import { getStoredRepoExecutionHostId } from '../../workspaces/execution-host/repo-execution-host'
import { guardWslUncPathAccess } from '../../wsl/filesystem/wsl-unc-access-gate'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { registerCnbReviewHandlers } from './cnb-review'
import { registerCnbTaskDispatchHandlers } from './cnb-task-dispatch'
import { registerCnbInlineReadHandlers } from './cnb-inline-reads'
import {
  issueWriteRequest as issueWriteSchema,
  pullWriteRequest as pullWriteSchema
} from './cnb-write-schemas'

const filtersSchema = z.object({
  state: z.enum(['open', 'closed', 'all']),
  keyword: z.string().max(200),
  authors: z.array(z.string().max(100)).max(16),
  assignees: z.array(z.string().max(100)).max(16),
  reviewers: z.array(z.string().max(100)).max(16),
  labels: z.array(z.string().max(200)).max(20)
})

const listRequest = z.object({
  repoIds: z.array(z.string().min(1)).min(1).max(50),
  kind: z.enum(['issues', 'pull-requests']),
  filters: filtersSchema,
  page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
})

const targetRequest = z.object({
  repoId: z.string().min(1),
  number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
})

const missionResourceRequest = z.object({
  missionPath: z.string().min(1).max(400),
  cursor: z.string().max(2048).nullable(),
  view: z
    .object({
      selector: z
        .array(
          z.object({
            field: z.string().max(200),
            operator: z.string().max(50),
            value: z.array(z.string().max(500)).max(50)
          })
        )
        .max(50),
      sort: z
        .array(z.object({ field: z.string().max(200), order: z.enum(['asc', 'desc']) }))
        .max(10),
      fields: z.array(z.string().max(200)).max(100)
    })
    .nullable()
})

const missionViewConfigRequest = z.object({
  missionPath: z.string().min(1).max(400),
  viewId: z.string().min(1).max(200)
})

const missionListRequest = z.object({ orgs: z.array(z.string().min(1).max(200)).min(1).max(20) })

const labelsRequest = z.object({ repoIds: z.array(z.string().min(1)).min(1).max(50) })

const attachRequest = z.object({
  repoId: z.string().min(1),
  issueNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  base64: z
    .string()
    .min(1)
    .max(40 * 1024 * 1024)
})

const issueWriteRequest = issueWriteSchema
const pullWriteRequest = pullWriteSchema

async function resolveTaskRepository(store: Store, repo: Repo): Promise<string | null> {
  const localGitExecOptions = getLocalProjectWorktreeGitOptions(store, repo)
  return guardWslUncPathAccess(
    repo.path,
    () =>
      cnbForgeProvider.resolveRepository({
        repoPath: repo.path,
        executionHostId: getStoredRepoExecutionHostId(repo),
        localGitExecOptions
      }),
    { wslDistro: localGitExecOptions.wslDistro }
  )
}

async function resolveRepoSlug(store: Store, repoId: string): Promise<string | null> {
  const repo = store.getRepo(repoId)
  if (!repo || !isGitRepoKind(repo)) {
    return null
  }
  return resolveTaskRepository(store, repo).catch(() => null)
}

export function registerCnbHandlers(store: Store, runtime: OrcaRuntimeService): void {
  registerCnbTaskDispatchHandlers(runtime, store, (repoId) => resolveRepoSlug(store, repoId))
  registerCnbReviewHandlers(store, runtime)
  registerCnbInlineReadHandlers(store, (repoId) => resolveRepoSlug(store, repoId))
  ipcMain.handle('cnb:connect', (_event, token: unknown) => connectCnb(token))
  ipcMain.handle('cnb:disconnect', () => disconnectCnb())
  ipcMain.handle('cnb:status', () => getCnbCredentialStatus())
  ipcMain.handle('cnb:task-repositories', async () => {
    const candidates = getTaskEligibleRepos(store.getRepos())
    const resolved = await mapSettledWithConcurrency(candidates, 4, (repo) =>
      resolveTaskRepository(store, repo)
    )
    const repositories = new Map<string, CnbTaskRepository>()
    for (let index = 0; index < resolved.length; index++) {
      const result = resolved[index]
      if (result.status === 'fulfilled' && result.value) {
        const slug = result.value
        const key = slug.toLowerCase()
        if (!repositories.has(key)) {
          repositories.set(key, { id: candidates[index].id, slug })
        }
      }
    }
    return {
      ok: true as const,
      repositories: [...repositories.values()],
      incomplete: resolved.some((result) => result.status === 'rejected')
    }
  })
  ipcMain.handle('cnb:task-list', async (_event, request: unknown) => {
    const { repoIds, kind, filters, page } = listRequest.parse(request)
    const repositories: CnbTaskRepository[] = []
    for (const repoId of repoIds) {
      const slug = await resolveRepoSlug(store, repoId)
      if (slug) {
        repositories.push({ id: repoId, slug })
      }
    }
    return readCnbTaskList({ repositories, kind, filters, page })
  })
  ipcMain.handle('cnb:issue-detail', async (_event, request: unknown) => {
    const { repoId, number } = targetRequest.parse(request)
    const slug = await resolveRepoSlug(store, repoId)
    if (!slug) {
      return { ok: false as const, reason: 'repository-unavailable' as const }
    }
    return readCnbIssueDetail(slug, number)
  })
  ipcMain.handle('cnb:pull-detail', async (_event, request: unknown) => {
    const { repoId, number } = targetRequest.parse(request)
    const slug = await resolveRepoSlug(store, repoId)
    if (!slug) {
      return { ok: false as const, reason: 'repository-unavailable' as const }
    }
    return readCnbPullDetail(slug, number)
  })
  ipcMain.handle('cnb:viewer', () => readCnbViewer())
  ipcMain.handle('cnb:labels', async (_event, request: unknown) => {
    const { repoIds } = labelsRequest.parse(request)
    const repositories: CnbTaskRepository[] = []
    for (const repoId of repoIds) {
      const slug = await resolveRepoSlug(store, repoId)
      if (slug) {
        repositories.push({ id: repoId, slug })
      }
    }
    return readCnbLabels(repositories)
  })
  ipcMain.handle('cnb:missions', async (_event, request: unknown) => {
    const { orgs } = missionListRequest.parse(request)
    // Aggregate across every selected org so a selection spanning orgs isn't truncated to the shortest repo.
    const results = await Promise.all(orgs.map((org) => readCnbMissions(org)))
    const missions: CnbMission[] = []
    let canQueryResources = false
    let sawForbidden = false
    let sawRequestFailed = false
    for (const result of results) {
      if (!result.ok) {
        if (result.reason === 'not-connected') {
          return { ok: false as const, reason: 'not-connected' as const }
        }
        if (result.reason === 'forbidden') {
          sawForbidden = true
        } else {
          sawRequestFailed = true
        }
        continue
      }
      canQueryResources = canQueryResources || result.canQueryResources
      missions.push(...result.missions)
    }
    if (missions.length === 0 && (sawForbidden || sawRequestFailed)) {
      return {
        ok: false as const,
        reason: sawForbidden ? ('forbidden' as const) : ('request-failed' as const)
      }
    }
    return { ok: true as const, missions, canQueryResources }
  })
  ipcMain.handle('cnb:mission-resources', async (_event, request: unknown) => {
    const { missionPath, cursor, view } = missionResourceRequest.parse(request)
    return readCnbMissionResources({ missionPath, cursor, view })
  })
  ipcMain.handle('cnb:mission-view-config', async (_event, request: unknown) => {
    const { missionPath, viewId } = missionViewConfigRequest.parse(request)
    return readCnbMissionViewConfig(missionPath, viewId)
  })
  ipcMain.handle('cnb:upload-attachment', async (_event, request: unknown) => {
    const { repoId, issueNumber, fileName, contentType, base64 } = attachRequest.parse(request)
    const slug = await resolveRepoSlug(store, repoId)
    if (!slug) {
      return { ok: false as const, reason: 'repository-unavailable' }
    }
    const bytes = Buffer.from(base64, 'base64')
    return uploadCnbAttachment({
      target:
        issueNumber !== null
          ? { kind: 'issue-comment', repository: slug, number: issueNumber }
          : { kind: 'repo', repository: slug },
      fileName,
      contentType,
      bytes
    })
  })
  ipcMain.handle('cnb:issue-write', async (_event, request: unknown) => {
    const { repoId, number, payload } = issueWriteRequest.parse(request)
    const slug = await resolveRepoSlug(store, repoId)
    if (!slug) {
      return { ok: false as const, reason: 'repository-unavailable' }
    }
    return writeCnbIssue(slug, number, payload)
  })
  ipcMain.handle('cnb:pull-write', async (_event, request: unknown) => {
    const { repoId, number, payload } = pullWriteRequest.parse(request)
    const slug = await resolveRepoSlug(store, repoId)
    if (!slug) {
      return { ok: false as const, reason: 'repository-unavailable' }
    }
    return writeCnbPull(slug, number, payload)
  })
}
