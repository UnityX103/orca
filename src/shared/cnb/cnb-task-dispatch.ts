export type CnbTaskDispatchTarget = {
  repoId: string
  type: 'issue' | 'pr'
  number: number
}

export type CnbTaskDispatchRequest = CnbTaskDispatchTarget & {
  worktreeId: string
  title: string
  spec: string
  retryOf?: string
}

export type CnbTaskDispatch = {
  runId: string
  taskId: string
  dispatchId: string
  worktreeId: string
  sessionId: string | null
  status: 'starting' | 'working' | 'waiting' | 'idle' | 'completed' | 'failed' | 'unknown'
  error: string | null
  canRetry: boolean
}
