import {
  gitOptionsForWorktree,
  type GitRuntimeOptions
} from '../../command-runner/git-runtime-options'
import { gitExecFileAsync } from '../../command-runner/git-exec-file'
import { gitOptionalLocksDisabledEnv } from '../../command-runner/git-environment/git-process-env'

/** Submodule `ignore` config hides edits from the panel's status; refuse only on edits inside one. */
export async function firstHiddenSubmoduleEdit(
  worktreePath: string,
  options: GitRuntimeOptions
): Promise<string | null> {
  const execution = {
    ...gitOptionsForWorktree(worktreePath, { ...options, admissionTier: 'interactive' }),
    env: gitOptionalLocksDisabledEnv()
  }
  // No gitlink in the index, nothing hidden: skip a second working-tree walk on every switch.
  // The index decides, not `.gitmodules` on disk (sparse checkout can omit it while git still
  // reads submodule config from the index). Modes only keep large indexes under the output cap;
  // a failed, overflowing or too-old-git read probes anyway.
  const index = await gitExecFileAsync(
    ['ls-files', '-z', '--format=%(objectmode)'],
    execution
  ).catch(() => null)
  if (index !== null && !index.stdout.split('\0').includes('160000')) {
    return null
  }
  const { stdout } = await gitExecFileAsync(
    ['status', '--porcelain=v2', '--untracked-files=no', '--ignore-submodules=none'],
    execution
  )
  for (const line of stdout.split('\n')) {
    // `1 XY S<c><m><u> …`: m means tracked edits inside (untracked ones are not listed here and a
    // switch cannot lose them); a commit mismatch alone is left alone, since checkout never
    // touches a submodule's working tree.
    const fields = line.split(' ')
    const sub = fields[2] ?? ''
    if (
      (fields[0] === '1' || fields[0] === '2') &&
      sub.startsWith('S') &&
      /[MU]/.test(sub.slice(2))
    ) {
      return fields
        .slice(fields[0] === '1' ? 8 : 9)
        .join(' ')
        .split('\t')[0]
    }
  }
  return null
}

export async function hasPendingChanges(
  worktreePath: string,
  options: GitRuntimeOptions
): Promise<boolean> {
  const { stdout } = await gitExecFileAsync(
    ['status', '--porcelain=v1', '--untracked-files=normal', '--ignore-submodules=none'],
    {
      ...gitOptionsForWorktree(worktreePath, { ...options, admissionTier: 'interactive' }),
      env: gitOptionalLocksDisabledEnv()
    }
  )
  return stdout.length > 0
}
