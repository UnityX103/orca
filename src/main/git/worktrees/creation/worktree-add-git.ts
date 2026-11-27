import { GitCommandTimeoutError } from '../../../../shared/git/commands/git-command-timeout'
import { gitExecFileAsync } from '../../command-runner/git-exec-file'
import {
  gitExecOptions,
  resolveWorktreeAddTimeoutMs,
  WORKTREE_ADD_TIMEOUT_MAX_MS,
  worktreeAddTimeoutMessage,
  type AddWorktreeOptions
} from '../worktree-operation-options'
import {
  createWorktreeCheckoutProgressDetector,
  createWorktreeCheckoutProgressReader
} from './worktree-checkout-progress'

export async function runWorktreeAddGit(
  repoPath: string,
  args: string[],
  noCheckout: boolean,
  options: AddWorktreeOptions
): Promise<void> {
  // Read Git's existing stderr meter without requesting extra progress output.
  const checkoutProgress =
    options.onCheckoutProgress && !noCheckout
      ? createWorktreeCheckoutProgressReader(options.onCheckoutProgress)
      : null
  // A nonblank host override opts into the fixed limit, including its validation fallback.
  const progressTimeout =
    !noCheckout && !process.env.ORCA_WORKTREE_ADD_TIMEOUT_MS?.trim()
      ? {
          maxDurationMs: WORKTREE_ADD_TIMEOUT_MAX_MS,
          createProgressDetector: createWorktreeCheckoutProgressDetector
        }
      : undefined
  try {
    await gitExecFileAsync(args, {
      ...gitExecOptions(repoPath, options),
      admissionClass: noCheckout ? undefined : 'checkout',
      timeout: resolveWorktreeAddTimeoutMs(),
      progressTimeout,
      onStderr: checkoutProgress?.read
    })
  } catch (error) {
    if (error instanceof GitCommandTimeoutError) {
      error.message = worktreeAddTimeoutMessage(
        error.timeoutMs,
        progressTimeout !== undefined && error.timeoutMs < progressTimeout.maxDurationMs
      )
    }
    throw error
  } finally {
    checkoutProgress?.close()
  }
}
