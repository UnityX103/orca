import { ipcMain } from 'electron'
import { z } from 'zod'
import { lazyZodSchema } from '../../../shared/schema/lazy-zod-schema'
import { readCnbMembers, readCnbPullChecks } from '../../cnb/tasks'
import type { Store } from '../../persistence/loading-store/store'

const repoIdRequest = lazyZodSchema(() => z.object({ repoId: z.string().min(1) }))
const pullTargetRequest = lazyZodSchema(() =>
  z.object({
    repoId: z.string().min(1),
    number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
  })
)

type ResolveSlug = (repoId: string) => Promise<string | null>

/** The list row's lazy reads (members, PR checks), split out to keep the main CNB IPC file lean. */
export function registerCnbInlineReadHandlers(store: Store, resolveRepoSlug: ResolveSlug): void {
  ipcMain.handle('cnb:members', async (_event, request: unknown) => {
    const { repoId } = repoIdRequest.parse(request)
    const slug = await resolveRepoSlug(repoId)
    if (!slug) {
      return { ok: false as const, reason: 'not-connected' as const }
    }
    return readCnbMembers(slug)
  })
  ipcMain.handle('cnb:pull-checks', async (_event, request: unknown) => {
    const { repoId, number } = pullTargetRequest.parse(request)
    const slug = await resolveRepoSlug(repoId)
    if (!slug) {
      return { ok: false as const, reason: 'repository-unavailable' as const }
    }
    return readCnbPullChecks(slug, number)
  })
  void store
}
