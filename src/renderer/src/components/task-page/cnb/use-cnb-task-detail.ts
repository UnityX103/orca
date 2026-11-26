import { useCallback, useEffect, useState } from 'react'
import type { PreloadApi } from '../../../../../preload/api-types'
import type {
  CnbDetailResult,
  CnbIssueDetail,
  CnbIssueWrite,
  CnbPullDetail,
  CnbPullWrite,
  CnbTaskRow,
  CnbWriteResult
} from '../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

export type CnbDetailState<T> =
  | { status: 'loading' }
  | { status: 'ready'; detail: T }
  | { status: 'error'; reason: string }

function useCnbDetail<T>(
  load: ((signal: { active: boolean }) => Promise<CnbDetailResult<T>>) | null,
  key: string,
  refreshNonce: number
): CnbDetailState<T> {
  const [state, setState] = useState<CnbDetailState<T>>({ status: 'loading' })
  useEffect(() => {
    if (!load) {
      return
    }
    const signal = { active: true }
    setState({ status: 'loading' })
    void load(signal).then(
      (result) => {
        if (!signal.active) {
          return
        }
        setState(
          result.ok
            ? { status: 'ready', detail: result.detail }
            : { status: 'error', reason: result.reason }
        )
      },
      () => {
        if (signal.active) {
          setState({ status: 'error', reason: 'request-failed' })
        }
      }
    )
    return () => {
      signal.active = false
    }
    // Key captures api/row identity; refreshNonce re-runs on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshNonce])
  return state
}

export function useCnbIssueDetail(args: {
  api: CnbApi
  row: CnbTaskRow | null
  refreshNonce: number
}): CnbDetailState<CnbIssueDetail> {
  const { api, row, refreshNonce } = args
  const key = row ? `issue:${row.repoId}:${row.number}` : ''
  return useCnbDetail(
    row ? () => api.issueDetail({ repoId: row.repoId, number: row.number }) : null,
    key,
    refreshNonce
  )
}

export function useCnbPullDetail(args: {
  api: CnbApi
  row: CnbTaskRow | null
  refreshNonce: number
}): CnbDetailState<CnbPullDetail> {
  const { api, row, refreshNonce } = args
  const key = row ? `pull:${row.repoId}:${row.number}` : ''
  return useCnbDetail(
    row ? () => api.pullDetail({ repoId: row.repoId, number: row.number }) : null,
    key,
    refreshNonce
  )
}

function useCnbWriter<TPayload>(run: ((payload: TPayload) => Promise<CnbWriteResult>) | null) {
  const [busy, setBusy] = useState(false)
  const submit = useCallback(
    async (payload: TPayload): Promise<CnbWriteResult> => {
      if (!run) {
        return { ok: false, reason: 'unavailable' }
      }
      setBusy(true)
      try {
        return await run(payload)
      } finally {
        setBusy(false)
      }
    },
    [run]
  )
  return { busy, submit }
}

export function useCnbIssueWriter(args: { api: CnbApi; row: CnbTaskRow; onWritten: () => void }) {
  const { api, row, onWritten } = args
  const run = useCallback(
    async (payload: CnbIssueWrite): Promise<CnbWriteResult> => {
      const result = await api.writeIssue({
        repoId: row.repoId,
        number: payload.action === 'create' ? null : row.number,
        payload
      })
      if (result.ok) {
        onWritten()
      }
      return result
    },
    [api, row, onWritten]
  )
  return useCnbWriter<CnbIssueWrite>(run)
}

export function useCnbPullWriter(args: { api: CnbApi; row: CnbTaskRow; onWritten: () => void }) {
  const { api, row, onWritten } = args
  const run = useCallback(
    async (payload: CnbPullWrite): Promise<CnbWriteResult> => {
      const result = await api.writePull({ repoId: row.repoId, number: row.number, payload })
      if (result.ok) {
        onWritten()
      }
      return result
    },
    [api, row, onWritten]
  )
  return useCnbWriter<CnbPullWrite>(run)
}
