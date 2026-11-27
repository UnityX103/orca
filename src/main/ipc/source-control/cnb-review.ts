import { ipcMain } from 'electron'
import { z } from 'zod'
import { getRepoExecutionHostId } from '../../../shared/execution-host/execution-host'
import { CnbHostedReviewMutation } from '../../../shared/rpc-contract/source-control/hosted-review-params'
import { isGitRepoKind } from '../../../shared/repository/repo-kind'
import { readCnbReviewDetails } from '../../cnb/review-details'
import type { Store } from '../../persistence/loading-store/store'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'

const cnbReviewActionRequest = CnbHostedReviewMutation.extend({
  repoOwnerExecutionHostId: z.string().min(1)
})

export function registerCnbReviewHandlers(store: Store, runtime: OrcaRuntimeService): void {
  ipcMain.handle('cnb:review-details', (_event, url: unknown) => readCnbReviewDetails(url))
  ipcMain.handle('cnb:review-action', async (_event, request: unknown) => {
    const {
      repo: repoId,
      reviewUrl,
      action,
      repoOwnerExecutionHostId
    } = cnbReviewActionRequest.parse(request)
    const repo = store.getRepo(repoId)
    if (
      !repo ||
      !isGitRepoKind(repo) ||
      getRepoExecutionHostId(repo) !== repoOwnerExecutionHostId
    ) {
      return { ok: false as const, reason: 'The CNB repository is unavailable on this host.' }
    }
    return runtime.mutateCnbHostedReview({ repo: `id:${repoId}`, reviewUrl, action })
  })
}
