import { getWorkspaceAttachments } from '../../../../../shared/workspace-attachments/workspace-attachments'
import type { Worktree } from '../../../../../shared/worktree/types'
import { parseWorkspaceKey } from '../../../../../shared/workspace/identity/workspace-scope'

function slugFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'cnb.cool') {
      return null
    }
    const match = /^\/(.+?)\/-\/(?:issues|pulls)\/[1-9]\d*\/?$/.exec(parsed.pathname)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

/** A CNB issue/PR is attached when a workspace carries a cnb link for the same repo, type and number. */
export function findCnbWorkItemWorkspaceAttachment(
  worktrees: readonly Worktree[],
  repoId: string | null | undefined,
  type: 'issue' | 'pr',
  number: number,
  sourceUrl?: string
): Worktree | null {
  const sourceSlug = sourceUrl ? slugFromUrl(sourceUrl) : null
  return (
    worktrees.find((worktree) => {
      if (worktree.isArchived) {
        return false
      }
      return getWorkspaceAttachments(worktree).some((item) => {
        if (item.provider !== 'cnb' || item.type !== type || item.number !== number) {
          return false
        }
        const linkedSlug = item.url ? slugFromUrl(item.url) : null
        if (sourceSlug && linkedSlug) {
          return sourceSlug.toLowerCase() === linkedSlug.toLowerCase()
        }
        if (parseWorkspaceKey(worktree.id)?.type === 'folder') {
          return true
        }
        if (linkedSlug && !sourceSlug) {
          return item.repoId === repoId && worktree.repoId === repoId
        }
        return worktree.repoId === repoId && (!item.repoId || item.repoId === repoId)
      })
    }) ?? null
  )
}
