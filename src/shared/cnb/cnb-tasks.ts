export type CnbTaskKind = 'issues' | 'merged-prs'

export type CnbTaskRepository = { id: string; slug: string }

export type CnbTaskItem = {
  number: number
  title: string
  url: string
  state: 'open' | 'closed' | 'merged'
  updatedAt: string | null
}

export type CnbTaskPage =
  | { ok: true; items: CnbTaskItem[]; hasNextPage: boolean }
  | { ok: false; reason: 'not-connected' | 'repository-unavailable' | 'request-failed' }
