import { ipcMain } from 'electron'
import { z } from 'zod'
import type { CnbTaskRepository } from '../../../shared/cnb/cnb-tasks'
import { mapSettledWithConcurrency } from '../../../shared/concurrency/map-with-concurrency'
import { isGitRepoKind } from '../../../shared/repository/repo-kind'
import type { Repo } from '../../../shared/repository/repo-types'
import { getTaskEligibleRepos } from '../../../shared/work-items/task-repo-selection'
import { connectCnb, disconnectCnb, getCnbCredentialStatus } from '../../cnb/credentials'
import { cnbForgeProvider } from '../../cnb/forge-provider'
import { readCnbReviewDetails } from '../../cnb/pull-requests'
import { readCnbTaskPage } from '../../cnb/tasks'
import type { Store } from '../../persistence/loading-store/store'
import { getLocalProjectWorktreeGitOptions } from '../../workspaces/execution-host/project-runtime-git-options'
import { getStoredRepoExecutionHostId } from '../../workspaces/execution-host/repo-execution-host'
import { guardWslUncPathAccess } from '../../wsl/filesystem/wsl-unc-access-gate'

const taskPageRequest = z.object({
  repoId: z.string().min(1),
  kind: z.enum(['issues', 'merged-prs']),
  page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
})

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

export function registerCnbHandlers(store: Store): void {
  ipcMain.handle('cnb:connect', (_event, token: unknown) => connectCnb(token))
  ipcMain.handle('cnb:disconnect', () => disconnectCnb())
  ipcMain.handle('cnb:status', () => getCnbCredentialStatus())
  ipcMain.handle('cnb:review-details', (_event, url: unknown) => readCnbReviewDetails(url))
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
      repositories: [...repositories.values()],
      incomplete: resolved.some((result) => result.status === 'rejected')
    }
  })
  ipcMain.handle('cnb:task-page', async (_event, request: unknown) => {
    const { repoId, kind, page } = taskPageRequest.parse(request)
    const repo = store.getRepo(repoId)
    const slug =
      repo && isGitRepoKind(repo)
        ? await resolveTaskRepository(store, repo).catch(() => null)
        : null
    if (!slug) {
      return { ok: false, reason: 'repository-unavailable' }
    }
    return readCnbTaskPage(slug, kind, page)
  })
}
