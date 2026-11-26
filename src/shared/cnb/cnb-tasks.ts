export type CnbTaskKind = 'issues' | 'pull-requests'
export type CnbTaskState = 'open' | 'closed' | 'merged'
export type CnbListStateFilter = 'open' | 'closed' | 'all'

export type CnbTaskRepository = { id: string; slug: string }

export type CnbTaskLabel = { name: string; color: string | null }

export type CnbTaskReviewer = { login: string; reviewState: string | null }

export type CnbCheckState = 'pending' | 'success' | 'failure' | 'neutral'

/** One row of the merged multi-repository list; repoSlug disambiguates repeated numbers. */
export type CnbTaskRow = {
  repoId: string
  repoSlug: string
  number: number
  title: string
  url: string
  state: CnbTaskState
  isDraft: boolean
  author: string | null
  assignees: string[]
  labels: CnbTaskLabel[]
  reviewers: CnbTaskReviewer[]
  checks: CnbCheckState | null
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null
  updatedAt: string | null
}

export type CnbListFilters = {
  state: CnbListStateFilter
  keyword: string
  authors: string[]
  assignees: string[]
  reviewers: string[]
  labels: string[]
}

/** Why no keyword param exists on CNB's PR list: search scans a fixed window and says so. */
export type CnbSearchScope = { scannedPages: number; truncated: boolean }

export type CnbTaskListPage =
  | {
      ok: true
      items: CnbTaskRow[]
      page: number
      hasNextPage: boolean
      pageCount: number | null
      scope: CnbSearchScope | null
      failures: { repoId: string; repoSlug: string; message: string }[]
    }
  | { ok: false; reason: CnbTaskFailureReason }

export type CnbTaskFailureReason =
  | 'not-connected'
  | 'repository-unavailable'
  | 'request-failed'
  | 'repositories-unavailable'
  | 'forbidden'

export type CnbMissionViewType = 'table' | 'board' | 'gantt'

export type CnbMissionListResult =
  | {
      ok: true
      missions: CnbMission[]
      /** True only when the token's scopes allow mission resource queries (mission-manage:r). */
      canQueryResources: boolean
    }
  | { ok: false; reason: 'not-connected' | 'forbidden' | 'request-failed' }

export type CnbMission = {
  org: string
  path: string
  name: string
  description: string
  visibility: string | null
}

export type CnbMissionView = { id: string; name: string; type: CnbMissionViewType }

export type CnbMissionField = {
  name: string
  interactionType: 'radio' | 'checkbox' | 'time_selector' | null
  operators: string[]
  values: string[]
}

/** A view's saved filter/sort that can be replayed against the resource query. */
export type CnbMissionSelector = { field: string; operator: string; value: string[] }
export type CnbMissionSort = { field: string; order: 'asc' | 'desc' }
export type CnbMissionViewConfig = {
  id: string
  selector: CnbMissionSelector[]
  sort: CnbMissionSort[]
  fields: string[]
}

export type CnbMissionResource = {
  kind: 'issue' | 'pull-request'
  repoSlug: string
  number: number
  title: string
  state: CnbTaskState
  url: string
  author: string | null
  assignees: string[]
  priority: string | null
  labels: CnbTaskLabel[]
  updatedAt: string | null
}

/**
 * A mission resource page. Views/fields carry through even when the resource query is
 * rejected (403) or fails, so the panel keeps its switches instead of blanking out.
 */
export type CnbMissionResourcePage =
  | {
      ok: true
      views: CnbMissionView[]
      fields: CnbMissionField[]
      resources: CnbMissionResource[]
      nextCursor: string | null
      total: number
      /** Set when views/fields loaded but the resource query itself was refused or failed. */
      resourcesError: 'forbidden' | 'request-failed' | null
    }
  | { ok: false; reason: CnbTaskFailureReason }

export type CnbComment = {
  id: string
  author: string
  body: string
  createdAt: string | null
}

export type CnbIssueProperty = { key: string; name: string; value: string }

export type CnbIssueDetail = {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  author: string | null
  assignees: string[]
  labels: CnbTaskLabel[]
  properties?: CnbIssueProperty[]
  comments: CnbComment[]
  url: string
  updatedAt: string | null
  canEdit: boolean
}

export type CnbPullFile = {
  path: string
  additions: number
  deletions: number
  patch: string | null
  patchTruncated: boolean
}

export type CnbPullCommit = {
  sha: string
  message: string
  author: string | null
  committedAt: string | null
}

export type CnbPullDetail = {
  number: number
  title: string
  body: string
  state: CnbTaskState
  isDraft: boolean
  author: string | null
  headRef: string
  baseRef: string
  headSha: string | null
  reviewers: CnbTaskReviewer[]
  labels: CnbTaskLabel[]
  checks: CnbCheckState
  checksSummary: { total: number; passed: number; failed: number; pending: number } | null
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  comments: CnbComment[]
  reviews: { id: string; author: string; state: string; body: string }[]
  files: CnbPullFile[]
  filesTruncated: boolean
  commits: CnbPullCommit[]
  url: string
  updatedAt: string | null
}

export type CnbDetailResult<T> =
  | { ok: true; detail: T }
  | { ok: false; reason: CnbTaskFailureReason | 'not-found' }

export type CnbWriteResult = { ok: true } | { ok: false; reason: string }

export type CnbIssueWrite =
  | { action: 'create'; title: string; body: string; labels: string[]; assignees: string[] }
  | { action: 'update'; title?: string; body?: string; state?: 'open' | 'closed' }
  | { action: 'comment'; body: string }
  | { action: 'labels'; labels: string[] }
  | { action: 'assignees'; assignees: string[] }
  | { action: 'property'; key: string; value: string }

export type CnbPullWrite =
  | { action: 'update'; title?: string; body?: string; state?: 'open' | 'closed' }
  | { action: 'comment'; body: string }
  | { action: 'reviewers'; reviewers: string[] }
  | { action: 'labels'; labels: string[] }
  | { action: 'review'; event: 'approve' | 'comment' | 'request_changes'; body: string }
  | { action: 'merge'; style: 'merge' | 'squash' | 'rebase'; title: string; message: string }

/** A single attachment upload result; `markdown` is inserted into the body being edited. */
export type CnbAttachmentResult =
  | { ok: true; markdown: string; url: string }
  | { ok: false; reason: string }
