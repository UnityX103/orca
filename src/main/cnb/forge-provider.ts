import type {
  ForgeProvider,
  ForgeProviderRepositoryContext
} from '../source-control/forge-provider'
import { hostedReviewSshConnectionId } from '../source-control/hosted-review-execution-host'
import { getHostedReviewLocalGitOptions } from '../source-control/hosted-review-git-options'
import { getCnbReviewByNumber, getCnbReviewForBranch } from './pull-requests'
import { getCnbRepoRef } from './repository-ref'

function resolveRepository(context: ForgeProviderRepositoryContext): Promise<string | null> {
  return getCnbRepoRef(
    context.repoPath,
    hostedReviewSshConnectionId(context.executionHostId),
    getHostedReviewLocalGitOptions(context)
  )
}

export const cnbForgeProvider = {
  id: 'cnb',
  supportsReviewCreation: false,
  resolveRepository,
  async getReviewForBranch(input) {
    const repository = await resolveRepository(input)
    return repository ? getCnbReviewForBranch(repository, input.branch, input.currentHeadOid) : null
  },
  async getReviewByNumber(input) {
    const repository = await resolveRepository(input)
    return repository ? getCnbReviewByNumber(repository, input.number) : null
  }
} satisfies ForgeProvider
