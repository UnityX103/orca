import { getWorkspaceAttachments } from '../workspace-attachments/workspace-attachments'
import { parseWorkspaceKey } from '../workspace/identity/workspace-scope'
import type { Worktree } from '../worktree/types'
import { parseCnbWorkItemUrl } from './cnb-work-item-url'

function slugFromUrl(url?: string): string | null {
  if (!url) {
    return null
  }
  return parseCnbWorkItemUrl(url)?.repository.toLowerCase() ?? null
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
