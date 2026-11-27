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

export function useCnbRowWrites(args: { api: CnbApi | undefined; onChanged: () => void }) {
  const { api, onChanged } = args
  const [pending, setPending] = useState(false)
  const writing = useRef(false)

  const run = useCallback(
    async (
      send: (api: CnbApi) => Promise<CnbWriteResult>,
      failureMessage: string
    ): Promise<void> => {
      if (writing.current) {
        return
      }
      if (!api) {
        toast.error(failureMessage, { description: UNAVAILABLE.reason })
        return
      }
      writing.current = true
      setPending(true)
      let result: CnbWriteResult
      try {
        result = await send(api)
      } catch {
        result = REQUEST_FAILED
      }
      if (result.ok) {
        // The list replaces this row on refresh. Keep stale full-set edits disabled until then.
        onChanged()
        return
      }
      writing.current = false
      setPending(false)
      toast.error(failureMessage, { description: result.reason })
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
