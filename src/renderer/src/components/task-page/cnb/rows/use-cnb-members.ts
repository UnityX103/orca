import { useEffect, useState } from 'react'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbMember, CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

/** Successful member lookups are cached per repo so each popover open doesn't refetch. */
const memberCache = new Map<string, CnbMember[]>()

export type CnbMemberState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; members: CnbMember[] }
  | { status: 'forbidden' }
  | { status: 'error' }

/** Loads assignable/reviewer candidates from CNB only once a picker opens. */
export function useCnbMembers(
  api: CnbApi | undefined,
  row: CnbTaskRow,
  enabled: boolean
): CnbMemberState {
  const [state, setState] = useState<CnbMemberState>(() =>
    memberCache.has(row.repoId)
      ? { status: 'ready', members: memberCache.get(row.repoId) ?? [] }
      : { status: 'idle' }
  )
  useEffect(() => {
    if (!api || !enabled) {
      return
    }
    const cached = memberCache.get(row.repoId)
    if (cached) {
      setState({ status: 'ready', members: cached })
      return
    }
    let active = true
    setState({ status: 'loading' })
    void api.members({ repoId: row.repoId }).then(
      (result) => {
        if (!active) {
          return
        }
        if (result.ok) {
          memberCache.set(row.repoId, result.members)
          setState({ status: 'ready', members: result.members })
        } else {
          setState({ status: result.reason === 'forbidden' ? 'forbidden' : 'error' })
        }
      },
      () => {
        if (active) {
          setState({ status: 'error' })
        }
      }
    )
    return () => {
      active = false
    }
  }, [api, enabled, row.repoId])
  return state
}

/** Test helper: clear the module cache so fixtures/stories start clean. */
export function clearCnbMemberCache(): void {
  memberCache.clear()
}
