import type { CnbWriteResult } from '../../shared/cnb/cnb-tasks'
import { isGitRepoKind } from '../../shared/repository/repo-kind'
import type { Repo } from '../../shared/repository/repo-types'
import type { CnbHostedReviewMutationInput } from '../../shared/rpc-contract/source-control/hosted-review-params'
import { invalidateHostedReviewBranchCache } from '../source-control/hosted-review-branch-cache'
import { hostedReviewSshConnectionId } from '../source-control/hosted-review-execution-host'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import { getStoredRepoExecutionHostId } from '../workspaces/execution-host/repo-execution-host'
import { guardWslUncPathAccess } from '../wsl/filesystem/wsl-unc-access-gate'
import { getCnbCredentialToken } from './credentials'
import {
  cnbMergedSourceBranch,
  cnbPullMergeability,
  cnbPullMergeBlocker,
  cnbReviewState,
  pullPath,
  readCnbPull
} from './pull-requests'
import { deleteCnbSourceBranch } from './pull-source-branch'
import { getCnbRepoRef, parseCnbReviewUrl } from './repository-ref'
import { mergeCnbPull, writeCnbPull } from './task-writes'

export async function mutateCnbHostedReview(
  repo: Repo,
  { reviewUrl, action }: CnbHostedReviewMutationInput,
  executionOptions?: HostedReviewExecutionOptions
): Promise<CnbWriteResult> {
  if (!isGitRepoKind(repo)) {
    return { ok: false, reason: 'The selected workspace does not have a Git repository.' }
  }
  const repoPath = repo.path
  const executionHostId = getStoredRepoExecutionHostId(repo)
  const localGitOptions = getHostedReviewLocalGitOptions(executionOptions)
  const connectionId = hostedReviewSshConnectionId(executionHostId)
  const target = parseCnbReviewUrl(reviewUrl)
  const repository = await guardWslUncPathAccess(
    repoPath,
    () => getCnbRepoRef(repoPath, connectionId, localGitOptions),
    { wake: true, wslDistro: localGitOptions.wslDistro }
  )
  if (!repository || target?.repository.toLowerCase() !== repository.toLowerCase()) {
    return {
      ok: false,
      reason: 'This CNB pull request does not belong to the selected repository.'
    }
  }
  const token = await getCnbCredentialToken()
  if (!token) {
    return { ok: false, reason: 'Connect CNB in Settings > Integrations.' }
  }
  try {
    const pr = await readCnbPull(repository, target.number, token)
    if (!pr || pr.number !== target.number) {
      return { ok: false, reason: 'The CNB pull request is no longer available.' }
    }
    const state = cnbReviewState(pr)
    switch (action.kind) {
      case 'merge': {
        if (pr.head.sha !== action.expectedHeadSha) {
          return {
            ok: false,
            reason:
              'This pull request changed. Refresh and review the latest commits before merging.'
          }
        }
        if (
          state !== 'open' ||
          cnbPullMergeability(pr) !== 'MERGEABLE' ||
          cnbPullMergeBlocker(pr)
        ) {
          return {
            ok: false,
            reason: 'CNB reports that this pull request is blocked from merging.'
          }
        }
        return await mergeCnbPull(`${pullPath(repository)}/${target.number}`, token, action.method)
      }
      case 'state':
        if (state === 'merged') {
          return { ok: false, reason: 'This pull request has already been merged.' }
        }
        return await writeCnbPull(repository, target.number, {
          action: 'update',
          state: action.state
        })
      case 'delete-source-branch': {
        const branch = cnbMergedSourceBranch(repository, pr)
        if (branch?.name !== action.branch || branch.sha !== action.expectedHeadSha) {
          return { ok: false, reason: 'The merged CNB source branch could not be verified.' }
        }
        return await deleteCnbSourceBranch({
          repoPath,
          repository,
          token,
          localGitOptions,
          branch: branch.name,
          expectedHeadSha: branch.sha
        })
      }
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'CNB pull request action failed.'
    }
  } finally {
    invalidateHostedReviewBranchCache(repoPath, executionHostId)
  }
}
