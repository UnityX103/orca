import { useCallback, useEffect, useState } from 'react'
import type { PreloadApi } from '../../../../../preload/api-types'
import type {
  CnbListFilters,
  CnbMission,
  CnbMissionField,
  CnbMissionResource,
  CnbMissionView,
  CnbMissionViewConfig,
  CnbTaskListPage,
  CnbTaskRepository
} from '../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

export type CnbRepositoriesState =
  | { status: 'loading' }
  | { status: 'ready'; repositories: CnbTaskRepository[]; incomplete: boolean }
  | { status: 'error'; reason: 'not-connected' | 'request-failed' }

export type CnbListState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; page: Extract<CnbTaskListPage, { ok: true }> }
  | { status: 'error'; reason: string }

export function useCnbRepositories(api: CnbApi | undefined, refreshNonce: number) {
  const [state, setState] = useState<CnbRepositoriesState>({ status: 'loading' })
  useEffect(() => {
    if (!api) {
      return
    }
    let active = true
    setState({ status: 'loading' })
    void api.taskRepositories().then(
      (result) => {
        if (!active) {
          return
        }
        setState(
          result.ok
            ? {
                status: 'ready',
                repositories: result.repositories,
                incomplete: result.incomplete === true
              }
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
  }, [api, refreshNonce])
  return state
}

export function useCnbTaskList(args: {
  api: CnbApi | undefined
  repositories: CnbTaskRepository[]
  selectedIds: ReadonlySet<string>
  kind: 'issues' | 'pull-requests'
  filters: CnbListFilters
  page: number
  refreshNonce: number
}) {
  const { api, repositories, selectedIds, kind, filters, page, refreshNonce } = args
  const [state, setState] = useState<CnbListState>({ status: 'loading' })
  useEffect(() => {
    if (!api) {
      return
    }
    const repoIds = repositories.filter((repo) => selectedIds.has(repo.id)).map((repo) => repo.id)
    if (repoIds.length === 0) {
      // No selected repo that resolves to a CNB slug yet: show the empty state, not a spinner.
      setState({ status: 'empty' })
      return
    }
    let active = true
    setState({ status: 'loading' })
    void api.taskList({ repoIds, kind, filters, page }).then(
      (result) => {
        if (!active) {
          return
        }
        setState(
          result.ok ? { status: 'ready', page: result } : { status: 'error', reason: result.reason }
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
  }, [api, repositories, selectedIds, kind, filters, page, refreshNonce])

  const retry = useCallback(() => setState({ status: 'loading' }), [])
  return { state, retry }
}

export type CnbMissionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error'; reason: string }
  | {
      status: 'ready'
      missions: CnbMission[]
      selectedPath: string | null
      views: CnbMissionView[]
      fields: CnbMissionField[]
      selectedViewId: string | null
      resources: CnbMissionResource[]
      nextCursor: string | null
      total: number
      resourcesError: 'forbidden' | 'request-failed' | null
      canQueryResources: boolean
    }

/**
 * Missions are org-scoped and may span several orgs. Views and fields are fetched separately from
 * resources so a 403/failure keeps the view switcher usable. Resource pagination is cursor-based,
 * so each "load more" appends the next page instead of re-reading the current one.
 */
export function useCnbMissions(args: {
  api: CnbApi | undefined
  orgs: string[]
  refreshNonce: number
}) {
  const { api, orgs, refreshNonce } = args
  const [state, setState] = useState<CnbMissionState>({ status: 'idle' })
  const [cursor, setCursor] = useState<string | null>(null)
  const [more, setMore] = useState<CnbMissionResource[]>([])
  const selectedPath = state.status === 'ready' ? state.selectedPath : null
  const selectedViewId = state.status === 'ready' ? state.selectedViewId : null

  // Discover missions across every selected org.
  useEffect(() => {
    if (!api || orgs.length === 0) {
      setState({ status: 'idle' })
      return
    }
    let active = true
    setCursor(null)
    setMore([])
    setState({ status: 'loading' })
    void api.missions({ orgs }).then(
      (result) => {
        if (!active) {
          return
        }
        if (!result.ok) {
          setState({
            status: result.reason === 'forbidden' ? 'forbidden' : 'error',
            reason: result.reason
          })
          return
        }
        setState({
          status: 'ready',
          missions: result.missions,
          selectedPath: result.missions[0]?.path ?? null,
          views: [],
          fields: [],
          selectedViewId: null,
          resources: [],
          nextCursor: null,
          total: 0,
          resourcesError: null,
          canQueryResources: result.canQueryResources
        })
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
  }, [api, orgs, refreshNonce])

  // Load one page of resources for the selected mission + view, replaying the view's saved config.
  useEffect(() => {
    if (!api || !selectedPath) {
      return
    }
    let active = true
    void (async () => {
      const viewConfig: CnbMissionViewConfig | null = selectedViewId
        ? await api.missionViewConfig({ missionPath: selectedPath, viewId: selectedViewId })
        : null
      if (!active) {
        return
      }
      const result = await api
        .missionResources({
          missionPath: selectedPath,
          cursor,
          view: viewConfig
            ? { selector: viewConfig.selector, sort: viewConfig.sort, fields: viewConfig.fields }
            : null
        })
        .catch(() => ({ ok: false as const, reason: 'request-failed' as const }))
      if (!active) {
        return
      }
      if (!result.ok) {
        setState((current) =>
          current.status === 'ready'
            ? { ...current, resourcesError: 'request-failed' }
            : { status: 'error', reason: result.reason }
        )
        return
      }
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              views: result.views.length > 0 ? result.views : current.views,
              fields: result.fields.length > 0 ? result.fields : current.fields,
              selectedViewId: current.selectedViewId ?? result.views[0]?.id ?? null,
              resources: cursor ? current.resources : result.resources,
              nextCursor: result.nextCursor,
              total: result.total,
              resourcesError: result.resourcesError
            }
          : current
      )
      if (cursor && result.ok) {
        setMore((current) => [...current, ...result.resources])
      }
    })()
    return () => {
      active = false
    }
  }, [api, orgs, selectedPath, selectedViewId, cursor, refreshNonce])

  const missions = state.status === 'ready' ? state.missions : []
  const views = state.status === 'ready' ? state.views : []
  const fields = state.status === 'ready' ? state.fields : []
  const resources: CnbMissionResource[] =
    state.status === 'ready' ? [...state.resources, ...more] : []
  const selectMission = useCallback((path: string) => {
    setCursor(null)
    setMore([])
    setState((current) =>
      current.status === 'ready'
        ? { ...current, selectedPath: path, selectedViewId: null, resources: [], nextCursor: null }
        : current
    )
  }, [])
  const selectView = useCallback((viewId: string) => {
    setCursor(null)
    setMore([])
    setState((current) =>
      current.status === 'ready'
        ? { ...current, selectedViewId: viewId, resources: [], nextCursor: null }
        : current
    )
  }, [])
  const loadMore = useCallback(() => {
    if (state.status === 'ready' && state.nextCursor) {
      setCursor(state.nextCursor)
    }
  }, [state])
  return { missions, views, fields, state, resources, loadMore, selectMission, selectView }
}
