import type { CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'
import type { LinkedWorkItemSummary } from '@/lib/workspace/creation/new-workspace'
import type { Repo } from '../../../../../shared/repository/repo-types'
import { getTaskPageRepoSourceContext } from '@/lib/work-items/task-repo-source-context'
import { getLinkedWorkItemSuggestedName } from '../../../../../shared/workspace/naming/workspace-name'

export function cnbRowWorkItemType(row: CnbTaskRow): 'issue' | 'pr' {
  return /\/-\/pulls\/\d+\/?$/.test(row.url) ? 'pr' : 'issue'
}

/** The composer's linked item for a CNB row, mirroring GitHub/GitLab seeding. */
export function cnbLinkedWorkItem(row: CnbTaskRow): LinkedWorkItemSummary {
  return {
    provider: 'cnb',
    type: cnbRowWorkItemType(row),
    number: row.number,
    title: row.title,
    url: row.url,
    repoId: row.repoId
  }
}

export function cnbWorkspaceSeed(row: CnbTaskRow): string {
  return getLinkedWorkItemSuggestedName(cnbLinkedWorkItem(row))
}

export function cnbRowSourceContext(repo: Repo | undefined) {
  return getTaskPageRepoSourceContext(repo ?? null, 'cnb')
}
