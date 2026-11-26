// The BoBot dispatch of one CNB record: its runtime record (the truth), and the actions that start,
// retry and open it. The record is read by work item alone, so it stays readable when its workspace
// is not attached yet; a retry and an open use the record's own workspace.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type {
  CnbTaskDispatch,
  CnbTaskDispatchRequest,
  CnbTaskDispatchTarget
} from '../../../../../../shared/cnb/cnb-task-dispatch'
import { openDesktopStructuredSession } from '@/lib/agent-session/open/activate-ai-vault-structured-session'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'
import { hasCnbTaskDispatchApi } from './cnb-dispatch-api-support'

type CnbApi = NonNullable<PreloadApi['cnb']>

const POLL_MS = 4_000

/** A record that can still change on its own; `unknown` is out of contact, not settled. */
function reReadable(dispatch: CnbTaskDispatch | null): boolean {
  return dispatch !== null && dispatch.status !== 'completed' && dispatch.status !== 'failed'
}

export type CnbDispatchState = {
  dispatch: CnbTaskDispatch | null
  supported: boolean
  busy: boolean
  error: string | null
  /** Starts a run, or hands back the record an idempotent repeat returned. */
  start: (request: CnbTaskDispatchRequest) => Promise<CnbTaskDispatch | null>
  /** Starts the failed record again against its own Task and workspace. */
  retry: () => Promise<CnbTaskDispatch | null>
  openSession: () => void
}

export function useCnbTaskDispatch(args: {
  api: CnbApi | undefined
  target: CnbTaskDispatchTarget | null
}): CnbDispatchState {
  const { api, target } = args
  const [dispatch, setDispatch] = useState<CnbTaskDispatch | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A read settling after a start must not replace the record the start returned.
  const readToken = useRef(0)

  const supported = hasCnbTaskDispatchApi(api)

  const read = useCallback(async (): Promise<void> => {
    if (!api?.getTaskDispatch || !target) {
      return
    }
    const token = (readToken.current += 1)
    try {
      const found = await api.getTaskDispatch(target)
      if (token === readToken.current) {
        setDispatch(found)
      }
    } catch {
      // A failed read keeps the last record; the runtime record still decides what is true.
    }
  }, [api, target])

  useEffect(() => {
    setDispatch(null)
    setError(null)
    void read()
    return () => {
      readToken.current += 1
    }
  }, [read])

  const canPoll = reReadable(dispatch)
  useEffect(() => {
    if (!canPoll) {
      return
    }
    return installWindowVisibilityInterval({ run: () => void read(), intervalMs: POLL_MS })
  }, [canPoll, read])

  const start = useCallback(
    async (request: CnbTaskDispatchRequest): Promise<CnbTaskDispatch | null> => {
      if (!api?.startTaskDispatch) {
        return null
      }
      setBusy(true)
      setError(null)
      try {
        const started = await api.startTaskDispatch(request)
        readToken.current += 1
        setDispatch(started)
        return started
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure))
        // A refused start may still have written a record; one read keeps the panel truthful.
        void read()
        return null
      } finally {
        setBusy(false)
      }
    },
    [api, read]
  )

  const retry = useCallback(async (): Promise<CnbTaskDispatch | null> => {
    if (!target || !dispatch) {
      return null
    }
    return start({
      repoId: target.repoId,
      type: target.type,
      number: target.number,
      // The record's own workspace: a retry never moves to another one.
      worktreeId: dispatch.worktreeId,
      title: `${target.type === 'pr' ? 'PR' : 'Issue'} #${target.number}`,
      // Empty spec: the host reuses the failed Task's instructions.
      spec: '',
      retryOf: dispatch.dispatchId
    })
  }, [target, dispatch, start])

  const openSession = useCallback(() => {
    if (!dispatch?.sessionId) {
      return
    }
    void openDesktopStructuredSession(
      {
        kind: 'history',
        structuredSession: {
          workspaceId: dispatch.worktreeId,
          sessionId: dispatch.sessionId
        }
      },
      { target: { kind: 'local' } }
    )
  }, [dispatch])

  return { dispatch, supported, busy, error, start, retry, openSession }
}
