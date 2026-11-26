import { workspaceHasCnbWorkItem } from '../../../../../shared/cnb/cnb-work-item-workspace'
import type { Worktree } from '../../../../../shared/worktree/types'

/** A CNB issue/PR is attached when a workspace carries a cnb link for the same repo, type and number. */
export function findCnbWorkItemWorkspaceAttachment(
  worktrees: readonly Worktree[],
  repoId: string | null | undefined,
  type: 'issue' | 'pr',
  number: number,
  sourceUrl?: string
): Worktree | null {
  return (
    worktrees.find((worktree) =>
      workspaceHasCnbWorkItem(worktree, repoId, type, number, sourceUrl)
    ) ?? null
  )
}
