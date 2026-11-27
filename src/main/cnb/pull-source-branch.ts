import { z } from 'zod'
import type { CnbWriteResult } from '../../shared/cnb/cnb-tasks'
import { gitExecFileAsync } from '../git/command-runner/git-exec-file'
import { gitOptionsForWorktree } from '../git/command-runner/git-runtime-options'
import type { HostedReviewLocalGitOptions } from '../source-control/hosted-review-git-options'
import { cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath, cnbRepositoryUrl } from './repository-ref'

const branchDetail = z.object({
  protected: z.boolean().optional(),
  locked: z.boolean().optional(),
  commit: z.object({ sha: z.string() })
})

export async function readCnbSourceBranch(repository: string, branch: string, token: string) {
  const response = await cnbRequest(
    `${cnbRepositoryPath(repository)}/git/branches/${encodeURIComponent(branch)}`,
    token
  )
  if (!response.ok) {
    await discardCnbBody(response)
    if (response.status === 404) {
      return null
    }
    throw new Error(`Could not verify the CNB source branch (HTTP ${response.status}).`)
  }
  return branchDetail.parse(await response.json())
}

export async function deleteCnbSourceBranch({
  repoPath,
  repository,
  branch,
  expectedHeadSha,
  token,
  localGitOptions
}: {
  repoPath: string
  repository: string
  branch: string
  expectedHeadSha: string
  token: string
  localGitOptions: HostedReviewLocalGitOptions
}): Promise<CnbWriteResult> {
  const source = await readCnbSourceBranch(repository, branch, token)
  if (!source) {
    return { ok: false, reason: 'The CNB source branch is no longer available.' }
  }
  if (source.protected || source.locked || source.commit.sha !== expectedHeadSha) {
    return { ok: false, reason: 'The CNB source branch changed or is protected.' }
  }
  const options = gitOptionsForWorktree(repoPath, localGitOptions)
  const ref = `refs/heads/${branch}`
  const remote = cnbRepositoryUrl(repository)
  try {
    await gitExecFileAsync(['check-ref-format', ref], options)
    const { stdout } = await gitExecFileAsync(['ls-remote', '--symref', remote, 'HEAD'], {
      ...options,
      timeout: 15_000
    })
    const defaultRef = /^ref: (refs\/heads\/[^\t\r\n]+)\tHEAD\r?$/m.exec(stdout)?.[1]
    if (!defaultRef) {
      return { ok: false, reason: 'The CNB default branch could not be verified.' }
    }
    if (defaultRef === ref) {
      return { ok: false, reason: 'The CNB default branch must be preserved.' }
    }
    // CNB's branch DELETE does not take a head SHA. A Git lease makes deletion conditional.
    await gitExecFileAsync(
      ['push', `--force-with-lease=${ref}:${expectedHeadSha}`, remote, `:${ref}`],
      { ...options, timeout: 35_000 }
    )
    return { ok: true }
  } catch {
    return {
      ok: false,
      reason:
        'Git could not delete the CNB source branch. Refresh and check the branch and Git credentials.'
    }
  }
}
