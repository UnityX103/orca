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
  load: (request: { repoId: string; number: number }) => Promise<CnbDetailResult<T>>,
  row: CnbTaskRow | null,
  refreshNonce: number
): CnbDetailState<T> {
  const repoId = row?.repoId
  const number = row?.number
  const [state, setState] = useState<CnbDetailState<T>>({ status: 'loading' })
  useEffect(() => {
    if (repoId === undefined || number === undefined) {
      return
    }
    let active = true
    setState({ status: 'loading' })
    void load({ repoId, number }).then(
      (result) => {
        if (!active) {
          return
        }
        setState(
          result.ok
            ? { status: 'ready', detail: result.detail }
            : { status: 'error', reason: result.reason }
        )
      },
      () => {
        if (active) {
          setState({ status: 'error', reason: 'request-failed' })
        }
      }
    )
    return () => {
      active = false
    }
  }, [load, repoId, number, refreshNonce])
  return state
}

export function useCnbIssueDetail(args: {
  api: CnbApi
  row: CnbTaskRow | null
  refreshNonce: number
}): CnbDetailState<CnbIssueDetail> {
  const { api, row, refreshNonce } = args
  return useCnbDetail(api.issueDetail, row, refreshNonce)
}

export function useCnbPullDetail(args: {
  api: CnbApi
  row: CnbTaskRow | null
  refreshNonce: number
}): CnbDetailState<CnbPullDetail> {
  const { api, row, refreshNonce } = args
  return useCnbDetail(api.pullDetail, row, refreshNonce)
}

function useCnbWriter<TPayload>(run: ((payload: TPayload) => Promise<CnbWriteResult>) | null) {
  const [busy, setBusy] = useState(false)
  const submit = useCallback(
    async (payload: TPayload): Promise<CnbWriteResult> => {
      if (!run) {
        return { ok: false, reason: 'unavailable' }
      }
      setBusy(true)
      return run(payload).finally(() => setBusy(false))
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
