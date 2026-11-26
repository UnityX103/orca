import { getWorkspaceAttachments } from '../workspace-attachments/workspace-attachments'
import { parseWorkspaceKey } from '../workspace/identity/workspace-scope'
import type { Worktree } from '../worktree/types'

function slugFromUrl(url?: string): string | null {
  if (!url) {
    return null
  }
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'cnb.cool') {
      return null
    }
    const match = /^\/(.+?)\/-\/(?:issues|pulls)\/[1-9]\d*\/?$/.exec(parsed.pathname)
    return match ? decodeURIComponent(match[1]).toLowerCase() : null
  } catch {
    return null
  }
}

export function workspaceHasCnbWorkItem(
  worktree: Worktree,
  repoId: string | null | undefined,
  type: 'issue' | 'pr',
  number: number,
  sourceUrl?: string
): boolean {
  if (worktree.isArchived) {
    return false
  }
  const sourceSlug = slugFromUrl(sourceUrl)
  const folder = parseWorkspaceKey(worktree.id)?.type === 'folder'
  return getWorkspaceAttachments(worktree).some((item) => {
    if (item.provider !== 'cnb' || item.type !== type || item.number !== number) {
      return false
    }
    const linkedSlug = slugFromUrl(item.url)
    if (sourceSlug && linkedSlug) {
      return sourceSlug === linkedSlug
    }
    const linkedRepoId = item.repoId ?? item.taskSourceContext?.repoId
    if (folder) {
      return Boolean(repoId && linkedRepoId === repoId)
    }
    return worktree.repoId === repoId && (linkedRepoId === repoId || (!linkedSlug && !linkedRepoId))
  })
}
