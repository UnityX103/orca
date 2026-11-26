import { isLocalBranchNamespaceBlocked } from '../../refs/resolution/repo-branch-conflict'
import type { LocalGitExecOptions } from '../../refs/resolution/repo-default-base-ref'
import { gitExecFileAsync } from '../../command-runner/git-exec-file'
import { computeValidatedBranchName } from '../../../ipc/worktrees/creation/worktree-branch-name'

export async function resolveCreateBranchName(
  repoPath: string,
  branchNameOverride: string | undefined,
  sanitizedName: string,
  settings: { branchPrefix: string; branchPrefixCustom?: string },
  username: string | null,
  gitOptions: LocalGitExecOptions = {},
  allowNamespaceFallback = true
): Promise<string> {
  if (!branchNameOverride) {
    const branch = computeValidatedBranchName(sanitizedName, settings, username)
    return allowNamespaceFallback &&
      settings.branchPrefix === 'git-username' &&
      !sanitizedName.includes('/') &&
      branch.includes('/') &&
      (await isLocalBranchNamespaceBlocked(repoPath, branch, gitOptions))
      ? branch.replaceAll('/', '-')
      : branch
  }
  if (branchNameOverride.startsWith('-')) {
    throw new Error('Branch name must not start with "-"')
  }
  await gitExecFileAsync(['check-ref-format', '--branch', branchNameOverride], {
    cwd: repoPath,
    ...gitOptions
  })
  return branchNameOverride
}
