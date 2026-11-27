import type {
  ForgeProvider,
  ForgeProviderRepositoryContext
} from '../source-control/forge-provider'
import { hostedReviewSshConnectionId } from '../source-control/hosted-review-execution-host'
import { getHostedReviewLocalGitOptions } from '../source-control/hosted-review-git-options'
import { getCnbReviewByNumber, getCnbReviewForBranch } from './pull-requests'
import { createCnbPullRequest } from './pull-request-creation'
import { getCnbRepoRef } from './repository-ref'

function resolveRepository(context: ForgeProviderRepositoryContext): Promise<string | null> {
  return getCnbRepoRef(
    context.repoPath,
    hostedReviewSshConnectionId(context.executionHostId),
    getHostedReviewLocalGitOptions(context)
  )
}

function conflictContext(context: ForgeProviderRepositoryContext) {
  return hostedReviewSshConnectionId(context.executionHostId)
    ? undefined
    : { repoPath: context.repoPath, localGitOptions: getHostedReviewLocalGitOptions(context) }
}

export const cnbForgeProvider = {
  id: 'cnb',
  supportsReviewCreation: true,
  resolveRepository,
  async getReviewForBranch(input) {
    const repository = await resolveRepository(input)
    return repository
      ? getCnbReviewForBranch(
          repository,
          input.branch,
          input.currentHeadOid,
          conflictContext(input)
        )
      : null
  },
  async getReviewByNumber(input) {
    const repository = await resolveRepository(input)
    return repository
      ? getCnbReviewByNumber(repository, input.number, conflictContext(input))
      : null
  },
  async createReview(repoPath, input, executionHostId, options) {
    const repository = await resolveRepository({ ...options, repoPath, executionHostId })
    return repository
      ? createCnbPullRequest(repository, input)
      : {
          ok: false,
          code: 'unsupported_provider',
          reason: 'repository_not_found',
          error: 'Creating a pull request requires a CNB repository.'
        }
  }
} satisfies ForgeProvider
