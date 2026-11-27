import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { PreloadApi } from '../../../../../preload/api-types'
import { useTranslate } from '@/i18n/use-translate'
import {
  normalizeTaskRepoSelection,
  getTaskEligibleRepos
} from '../../../../../shared/work-items/task-repo-selection'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { useCnbMissions, useCnbRepositories, useCnbTaskList } from './use-cnb-task-list'
import { useCnbViewer, useCnbLabelOptions } from './use-cnb-auxiliary'
import {
  filtersForPreset,
  normalizeCnbPreset,
  rowMatchesPreset,
  type CnbMode,
  type CnbParticipantPreset
} from './cnb-task-filters'
import { CnbTaskToolbar } from './CnbTaskToolbar'
import { CnbTaskListPanel } from './CnbTaskListPanel'
import { CnbMissionsPanel } from './CnbMissionsPanel'
import { CnbTaskDetailRoute } from './detail/CnbTaskDetailRoute'
import { CnbCreateIssueDialog } from './CnbCreateIssueDialog'
import {
  useCnbOpenWorkItem,
  useCnbOpenIntegrations,
  useCnbNewWorkItem,
  useCnbWorkspaceAttachment
} from './use-cnb-open-work-item'
import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import type { CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>
const NO_ORGANIZATIONS: string[] = []

export function CnbTasks({ model }: { model: TaskPageComposerActionsModel }): React.JSX.Element {
  const t = useTranslate()
  const api: CnbApi | undefined = window.api.cnb
  const [refreshNonce, setRefreshNonce] = useState(0)
  const repositories = useCnbRepositories(api, refreshNonce)
  const viewer = useCnbViewer(api, refreshNonce)
  const [mode, setMode] = useState<CnbMode>(model.taskResumeState?.cnbMode ?? 'issues')
  const [statePreset, setStatePreset] = useState<string>(
    () => model.taskResumeState?.cnbPreset ?? 'open'
  )
  const [participant, setParticipant] = useState<CnbParticipantPreset>('everyone')
  const [searchInput, setSearchInput] = useState(() => model.taskResumeState?.cnbQuery ?? '')
  const [appliedSearch, setAppliedSearch] = useState(searchInput)
  const [activeLabels, setActiveLabels] = useState<string[]>([])
  const [pageState, setPageState] = useState<{ key: string; page: number }>({ key: '', page: 1 })
  const [selectedRow, setSelectedRow] = useState<CnbTaskRow | null>(null)
  const [selectedPullChecks, setSelectedPullChecks] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const { setTaskResumeState, updateSettings, repoSelection, setRepoSelection } = model
  const handleOpenOrUse = useCnbOpenWorkItem(model, api)
  const handleNewWorkspace = useCnbNewWorkItem(model, api)
  const isWorkspaceAttached = useCnbWorkspaceAttachment(model)
  const openIntegrations = useCnbOpenIntegrations()
  useEffect(() => {
    setTaskResumeState({ cnbMode: mode, cnbPreset: statePreset, cnbQuery: appliedSearch })
  }, [mode, statePreset, appliedSearch, setTaskResumeState])

  const kind = mode === 'missions' ? 'issues' : mode
  const activePreset = normalizeCnbPreset(statePreset, kind)
  // Derive the page from the active filter set so a change starts at page 1 without a reset effect.
  const listContextKey = JSON.stringify([
    mode,
    statePreset,
    participant,
    appliedSearch,
    [...repoSelection].sort()
  ])
  const page = pageState.key === listContextKey ? pageState.page : 1
  const setPage = useCallback(
    (next: number) => setPageState({ key: listContextKey, page: next }),
    [listContextKey]
  )
  const listFilters = useMemo(
    () => ({
      ...filtersForPreset({
        preset: activePreset,
        kind,
        participant,
        viewer,
        labels: activeLabels
      }),
      keyword: appliedSearch
    }),
    [activePreset, kind, participant, viewer, appliedSearch, activeLabels]
  )

  const repoOptions = useMemo(
    () => (repositories.status === 'ready' ? repositories.repositories : []),
    [repositories]
  )
  // Org list across all selected repos so Missions aggregates, not just the shortest slug's org.
  const selectedOrgs = useMemo(() => {
    const orgs = new Set<string>()
    for (const repo of repoOptions) {
      if (repoSelection.has(repo.id)) {
        const org = repo.slug.split('/')[0]
        if (org) {
          orgs.add(org)
        }
      }
    }
    return [...orgs]
  }, [repoOptions, repoSelection])

  const labelOptions = useCnbLabelOptions({
    api,
    enabled: mode !== 'missions',
    repositories: repoOptions,
    selectedIds: repoSelection,
    refreshNonce
  })

  const toggleLabel = useCallback((label: string) => {
    setActiveLabels((current) =>
      current.includes(label) ? current.filter((entry) => entry !== label) : [...current, label]
    )
  }, [])

  const list = useCnbTaskList({
    api,
    repositories: repoOptions,
    selectedIds: repoSelection,
    kind,
    filters: listFilters,
    page,
    refreshNonce
  })
  const missions = useCnbMissions({
    api,
    orgs: mode === 'missions' ? selectedOrgs : NO_ORGANIZATIONS,
    refreshNonce
  })

  const visibleRows = useMemo(() => {
    if (list.state.status !== 'ready' || mode === 'missions') {
      return []
    }
    return list.state.page.items.filter((row) => rowMatchesPreset(row, activePreset, kind))
  }, [list.state, mode, activePreset, kind])

  const handleSelectionChange = useCallback(
    (next: ReadonlySet<string>) => {
      const normalized = normalizeTaskRepoSelection(getTaskEligibleRepos(model.repos), next)
      setRepoSelection(normalized)
      void updateSettings({ defaultRepoSelection: [...normalized] }).catch(() => {
        toast.error(t('cnb.tasks.selectionSaveFailed', 'Failed to save project selection.'))
      })
    },
    [model.repos, setRepoSelection, updateSettings, t]
  )
  const handleSelectAll = useCallback(() => {
    setRepoSelection(new Set(model.taskPickerRepos.map((repo) => repo.id)))
    void updateSettings({ defaultRepoSelection: null }).catch(() => {
      toast.error(t('cnb.tasks.selectionSaveFailed', 'Failed to save project selection.'))
    })
  }, [model.taskPickerRepos, setRepoSelection, updateSettings, t])

  const repoFailures =
    list.state.status === 'ready'
      ? list.state.page.failures.map((failure) => ({
          key: failure.repoId,
          message: t('cnb.tasks.repoFailed', 'Could not load {{repo}}.', {
            repo: failure.repoSlug
          })
        }))
      : []
  const onChanged = useCallback(() => setRefreshNonce((value) => value + 1), [])
  const openRow = useCallback((row: CnbTaskRow) => {
    setSelectedPullChecks(false)
    setSelectedRow(row)
  }, [])
  const openRowChecks = useCallback((row: CnbTaskRow) => {
    setSelectedPullChecks(true)
    setSelectedRow(row)
  }, [])

  const detail =
    selectedRow && api ? (
      <CnbTaskDetailRoute
        api={api}
        row={selectedRow}
        initialChecks={selectedPullChecks}
        onBack={() => setSelectedRow(null)}
        onChanged={onChanged}
        onStartWorkspace={handleOpenOrUse}
      />
    ) : null

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-2 pt-2"
      aria-label={t('cnb.tasks.source', 'CNB')}
    >
      {!api ? (
        <p role="status" className="py-3 text-sm text-muted-foreground">
          {t('cnb.tasks.unavailable', 'CNB tasks are available in the desktop app.')}
        </p>
      ) : detail ? (
        detail
      ) : (
        <>
          <CnbTaskToolbar
            mode={mode}
            onModeChange={setMode}
            pickerGroups={model.taskPickerGroups}
            selectedIds={repoSelection}
            onSelectionChange={handleSelectionChange}
            onSelectAll={handleSelectAll}
            getRepoHostLabel={model.getTaskPickerRepoHostLabel}
            stateChips={
              mode === 'pull-requests'
                ? [
                    { id: 'open', label: t('cnb.tasks.stateOpen', 'Open') },
                    { id: 'merged', label: t('cnb.tasks.stateMerged', 'Merged') },
                    { id: 'closed', label: t('cnb.tasks.stateClosed', 'Closed') },
                    { id: 'all', label: t('cnb.tasks.stateAll', 'All') }
                  ]
                : [
                    { id: 'open', label: t('cnb.tasks.stateOpen', 'Open') },
                    { id: 'closed', label: t('cnb.tasks.stateClosed', 'Closed') },
                    { id: 'all', label: t('cnb.tasks.stateAll', 'All') }
                  ]
            }
            activeState={statePreset}
            onStateChange={setStatePreset}
            participantChips={[
              { id: 'everyone', label: t('cnb.tasks.everyone', 'Everyone') },
              { id: 'mine', label: t('cnb.tasks.mine', 'Mine') },
              ...(mode === 'pull-requests'
                ? [{ id: 'reviewing' as const, label: t('cnb.tasks.reviewing', 'Reviewing') }]
                : [])
            ]}
            activeParticipant={participant}
            onParticipantChange={setParticipant}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onSearchSubmit={() => setAppliedSearch(searchInput.trim())}
            onSearchClear={() => {
              setSearchInput('')
              setAppliedSearch('')
            }}
            labelOptions={labelOptions}
            activeLabels={activeLabels}
            onToggleLabel={toggleLabel}
            onRefresh={onChanged}
            refreshing={list.state.status === 'loading'}
            createDisabled={mode === 'missions' || repoOptions.length === 0}
            onCreateIssue={() => setCreateOpen(true)}
          />
          {repositories.status === 'ready' && repositories.incomplete ? (
            <p role="status" className="px-3 text-xs text-muted-foreground">
              {t('cnb.tasks.incomplete', 'Some projects could not be checked for a CNB remote.')}
            </p>
          ) : null}
          {repositories.status === 'error' ? (
            <CnbTaskListPanel
              kind={kind}
              rows={[]}
              showRepo={false}
              loading={false}
              error={
                repositories.reason === 'not-connected'
                  ? t(
                      'cnb.tasks.connect',
                      'Connect CNB in Integrations to browse repository tasks.'
                    )
                  : t('cnb.tasks.requestError', 'Could not load tasks. Check the CNB connection.')
              }
              needsConnect={repositories.reason === 'not-connected'}
              empty={{
                title: t('cnb.tasks.repositoryError', 'Could not read CNB repository remotes.'),
                description: ''
              }}
              scopeNotice={null}
              failures={[]}
              page={1}
              pageCount={null}
              hasNextPage={false}
              api={api}
              isWorkspaceAttached={isWorkspaceAttached}
              onPageChange={setPage}
              onOpen={openRow}
              onOpenPullChecks={openRowChecks}
              onStartWorkspace={handleOpenOrUse}
              onUseNewWorkspace={handleNewWorkspace}
              onRetry={onChanged}
              onOpenIntegrations={openIntegrations}
              onChanged={onChanged}
            />
          ) : mode === 'missions' ? (
            <CnbMissionsPanel
              state={missions.state}
              missions={missions.missions}
              views={missions.views}
              fields={missions.fields}
              selectedViewId={
                missions.state.status === 'ready' ? missions.state.selectedViewId : null
              }
              resources={missions.resources}
              onSelectMission={missions.selectMission}
              onSelectView={missions.selectView}
              onLoadMore={missions.loadMore}
              onRetry={onChanged}
              onOpenResource={(resource) => {
                const repoId = repoOptions.find(
                  (repo) => repo.slug.toLowerCase() === resource.repoSlug.toLowerCase()
                )?.id
                if (!repoId) {
                  // A mission row for a repo outside the current selection opens on CNB instead.
                  openAppHttpLink(resource.url)
                  return
                }
                setSelectedRow({
                  repoId,
                  repoSlug: resource.repoSlug,
                  number: resource.number,
                  title: resource.title,
                  url: resource.url,
                  state: resource.state,
                  isDraft: false,
                  author: resource.author,
                  assignees: resource.assignees,
                  labels: resource.labels,
                  reviewers: [],
                  checks: null,
                  mergeable: null,
                  updatedAt: resource.updatedAt
                })
              }}
            />
          ) : (
            <CnbTaskListPanel
              kind={kind}
              rows={visibleRows}
              showRepo={repoSelection.size > 1}
              loading={list.state.status === 'loading'}
              error={
                list.state.status === 'error'
                  ? list.state.reason === 'not-connected'
                    ? t(
                        'cnb.tasks.connect',
                        'Connect CNB in Integrations to browse repository tasks.'
                      )
                    : t('cnb.tasks.requestError', 'Could not load tasks. Check the CNB connection.')
                  : null
              }
              needsConnect={list.state.status === 'error' && list.state.reason === 'not-connected'}
              empty={{
                title:
                  kind === 'issues'
                    ? t('cnb.tasks.noIssues', 'No issues match these filters.')
                    : t('cnb.tasks.noPulls', 'No pull requests match these filters.'),
                description: t(
                  'cnb.tasks.emptyHint',
                  'Adjust the filters, project selection, or search to widen the results.'
                )
              }}
              scopeNotice={
                list.state.status === 'ready' && list.state.page.scope?.truncated
                  ? t(
                      'cnb.tasks.prSearchScope',
                      'Search scanned the {{count}} newest pull request pages.',
                      { count: list.state.page.scope.scannedPages }
                    )
                  : null
              }
              failures={repoFailures}
              page={page}
              pageCount={list.state.status === 'ready' ? list.state.page.pageCount : null}
              hasNextPage={list.state.status === 'ready' && list.state.page.hasNextPage}
              api={api}
              isWorkspaceAttached={isWorkspaceAttached}
              onPageChange={setPage}
              onOpen={openRow}
              onOpenPullChecks={openRowChecks}
              onStartWorkspace={handleOpenOrUse}
              onUseNewWorkspace={handleNewWorkspace}
              onRetry={onChanged}
              onOpenIntegrations={openIntegrations}
              onChanged={onChanged}
            />
          )}
        </>
      )}
      {createOpen && api && repoOptions.length > 0 ? (
        <CnbCreateIssueDialog
          api={api}
          repositories={repoOptions}
          selectedIds={repoSelection}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            onChanged()
          }}
        />
      ) : null}
    </section>
  )
}
