import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type {
  CnbIssueWrite,
  CnbPullWrite,
  CnbTaskRow,
  CnbWriteResult
} from '../../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>
const UNAVAILABLE: CnbWriteResult = { ok: false, reason: 'unavailable' }
const REQUEST_FAILED: CnbWriteResult = { ok: false, reason: 'request-failed' }

/**
 * Serialize writes per row so two fast clicks can't race and overwrite each other with a
 * stale snapshot of labels/assignees. A failed write keeps the previous row (no optimistic value)
 * and surfaces a toast; a successful write refreshes the list.
 */
export function useCnbRowWrites(args: { api: CnbApi | undefined; onChanged: () => void }) {
  const { api, onChanged } = args
  const [pending, setPending] = useState(false)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())

  const run = useCallback(
    (
      send: (api: CnbApi) => Promise<CnbWriteResult>,
      failureMessage: string
    ): Promise<CnbWriteResult> => {
      const execute = async (): Promise<CnbWriteResult> => {
        if (!api) {
          toast.error(failureMessage)
          return UNAVAILABLE
        }
        setPending(true)
        let result: CnbWriteResult
        try {
          result = await send(api)
        } catch {
          result = REQUEST_FAILED
        } finally {
          setPending(false)
        }
        if (result.ok) {
          onChanged()
        } else {
          // Keep the row's current values; only tell the user the write failed and why.
          toast.error(failureMessage, { description: result.reason })
        }
        return result
      }
      const next = chainRef.current.then(execute, execute)
      chainRef.current = next.catch(() => {})
      return next
    },
    [api, onChanged]
  )

  const runIssue = useCallback(
    (row: CnbTaskRow, payload: CnbIssueWrite, failureMessage: string) =>
      run(
        (api) => api.writeIssue({ repoId: row.repoId, number: row.number, payload }),
        failureMessage
      ),
    [run]
  )

  const runPull = useCallback(
    (row: CnbTaskRow, payload: CnbPullWrite, failureMessage: string) =>
      run(
        (api) => api.writePull({ repoId: row.repoId, number: row.number, payload }),
        failureMessage
      ),
    [run]
  )

  return { pending, runIssue, runPull }
}

export type CnbRowWriteRunner = ReturnType<typeof useCnbRowWrites>
