import { defineFixture } from '../../../component-fixtures/component-fixture'
import { CnbTaskListPanel } from './CnbTaskListPanel'
import { CnbMissionsPanel as CnbMissionsPanelLazy } from './CnbMissionsPanel'
import type { CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'

const rows: CnbTaskRow[] = [
  {
    repoId: 'repo-a',
    repoSlug: 'nanzhaigame-xpy/mida2025',
    number: 128,
    title: '战斗结算在低帧率下偶发丢失伤害事件',
    url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/issues/128',
    state: 'open',
    isDraft: false,
    author: 'xpy',
    assignees: ['lin', 'zhou'],
    labels: [
      { name: 'bug', color: '#d73a4a' },
      { name: 'p1', color: '#fbca04' }
    ],
    reviewers: [],
    checks: null,
    mergeable: null,
    updatedAt: '2026-11-24T09:20:00.000Z'
  },
  {
    repoId: 'repo-b',
    repoSlug: 'nanzhaigame-xpy/engine-core',
    number: 128,
    title: '同编号不同仓库：资源热更索引越界',
    url: 'https://cnb.cool/nanzhaigame-xpy/engine-core/-/issues/128',
    state: 'closed',
    isDraft: false,
    author: 'wang',
    assignees: [],
    labels: [{ name: 'hotfix', color: '#0e8a16' }],
    reviewers: [],
    checks: null,
    mergeable: null,
    updatedAt: '2026-11-20T02:00:00.000Z'
  },
  {
    repoId: 'repo-a',
    repoSlug: 'nanzhaigame-xpy/mida2025',
    number: 57,
    title: 'Add input buffering for dash cancel',
    url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/issues/57',
    state: 'open',
    isDraft: false,
    author: 'li',
    assignees: ['xpy'],
    labels: [],
    reviewers: [],
    checks: null,
    mergeable: null,
    updatedAt: '2026-11-26T01:00:00.000Z'
  }
]

export const populated = defineFixture({
  width: 1040,
  render: () => (
    <CnbTaskListPanel
      kind="issues"
      rows={rows}
      showRepo
      loading={false}
      error={null}
      needsConnect={false}
      empty={{ title: 'No issues', description: '' }}
      scopeNotice={null}
      failures={[]}
      page={1}
      pageCount={3}
      hasNextPage
      onPageChange={() => {}}
      onOpen={() => {}}
      onStartWorkspace={() => {}}
      onRetry={() => {}}
      onOpenIntegrations={() => {}}
    />
  )
})

export const loading = defineFixture({
  width: 1040,
  render: () => (
    <CnbTaskListPanel
      kind="pull-requests"
      rows={[]}
      showRepo={false}
      loading
      error={null}
      needsConnect={false}
      empty={{ title: 'No pull requests', description: '' }}
      scopeNotice={null}
      failures={[]}
      page={1}
      pageCount={null}
      hasNextPage={false}
      onPageChange={() => {}}
      onOpen={() => {}}
      onStartWorkspace={() => {}}
      onRetry={() => {}}
      onOpenIntegrations={() => {}}
    />
  )
})

export const emptyWithNoRepo = defineFixture({
  width: 1040,
  render: () => (
    <CnbTaskListPanel
      kind="issues"
      rows={[]}
      showRepo={false}
      loading={false}
      error={null}
      needsConnect={false}
      empty={{
        title: 'No issues match these filters.',
        description: 'Adjust the filters, project selection, or search to widen the results.'
      }}
      scopeNotice={null}
      failures={[]}
      page={1}
      pageCount={null}
      hasNextPage={false}
      onPageChange={() => {}}
      onOpen={() => {}}
      onStartWorkspace={() => {}}
      onRetry={() => {}}
      onOpenIntegrations={() => {}}
    />
  )
})

export const perRepoFailure = defineFixture({
  width: 1040,
  render: () => (
    <CnbTaskListPanel
      kind="issues"
      rows={rows.slice(0, 1)}
      showRepo
      loading={false}
      error={null}
      needsConnect={false}
      empty={{ title: 'No issues', description: '' }}
      scopeNotice="Search scanned the 4 newest pull request pages."
      failures={[{ key: 'repo-b', message: 'Could not load nanzhaigame-xpy/engine-core.' }]}
      page={2}
      pageCount={5}
      hasNextPage
      onPageChange={() => {}}
      onOpen={() => {}}
      onStartWorkspace={() => {}}
      onRetry={() => {}}
      onOpenIntegrations={() => {}}
    />
  )
})

export const connectRequired = defineFixture({
  width: 1040,
  render: () => (
    <CnbTaskListPanel
      kind="issues"
      rows={[]}
      showRepo={false}
      loading={false}
      error="Connect CNB in Integrations to browse repository tasks."
      needsConnect
      empty={{ title: '', description: '' }}
      scopeNotice={null}
      failures={[]}
      page={1}
      pageCount={null}
      hasNextPage={false}
      onPageChange={() => {}}
      onOpen={() => {}}
      onStartWorkspace={() => {}}
      onRetry={() => {}}
      onOpenIntegrations={() => {}}
    />
  )
})

export const missionsEmpty = defineFixture({
  width: 1040,
  render: () => (
    <CnbMissionsPanelLazy
      state={{
        status: 'ready',
        missions: [],
        selectedPath: null,
        views: [],
        fields: [],
        selectedViewId: null,
        resources: [],
        nextCursor: null,
        total: 0,
        resourcesError: null,
        canQueryResources: false
      }}
      missions={[]}
      views={[]}
      fields={[]}
      selectedViewId={null}
      resources={[]}
      onSelectMission={() => {}}
      onSelectView={() => {}}
      onLoadMore={() => {}}
      onRetry={() => {}}
      onOpenResource={() => {}}
    />
  )
})

const roadmapMission = {
  org: 'nanzhaigame-xpy',
  path: 'nanzhaigame-xpy/roadmap',
  name: '路线图',
  description: '',
  visibility: 'private'
}

export const missionsReady = defineFixture({
  width: 1040,
  render: () => (
    <CnbMissionsPanelLazy
      state={{
        status: 'ready',
        missions: [
          roadmapMission,
          {
            org: 'nanzhaigame-xpy',
            path: 'nanzhaigame-xpy/ship',
            name: '发布',
            description: '',
            visibility: 'public'
          }
        ],
        selectedPath: 'nanzhaigame-xpy/roadmap',
        views: [
          { id: 'v1', name: '全部', type: 'table' },
          { id: 'v2', name: '进行中', type: 'board' }
        ],
        fields: [
          { name: '优先级', interactionType: 'radio', operators: ['equal'], values: ['P0', 'P1'] },
          { name: '负责人', interactionType: 'radio', operators: ['equal'], values: [] }
        ],
        selectedViewId: 'v1',
        resources: [
          {
            kind: 'issue',
            repoSlug: 'nanzhaigame-xpy/mida2025',
            number: 129,
            title: '【落后】C0–C8 本地化缺失内容',
            state: 'open',
            url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/issues/129',
            author: '海星',
            assignees: ['xpy'],
            priority: 'P1',
            labels: [{ name: '本地化', color: '#0e8a16' }],
            updatedAt: '2026-11-25T08:18:11Z'
          },
          {
            kind: 'pull-request',
            repoSlug: 'nanzhaigame-xpy/engine-core',
            number: 57,
            title: 'Buffer dash cancel input',
            state: 'merged',
            url: 'https://cnb.cool/nanzhaigame-xpy/engine-core/-/pulls/57',
            author: 'li',
            assignees: [],
            priority: null,
            labels: [],
            updatedAt: '2026-11-26T01:00:00Z'
          }
        ],
        nextCursor: 'cursor-2',
        total: 60,
        resourcesError: null,
        canQueryResources: true
      }}
      missions={[roadmapMission]}
      views={[
        { id: 'v1', name: '全部', type: 'table' },
        { id: 'v2', name: '进行中', type: 'board' }
      ]}
      fields={[
        { name: '优先级', interactionType: 'radio', operators: ['equal'], values: ['P0', 'P1'] },
        { name: '负责人', interactionType: 'radio', operators: ['equal'], values: [] }
      ]}
      selectedViewId="v1"
      resources={[
        {
          kind: 'issue',
          repoSlug: 'nanzhaigame-xpy/mida2025',
          number: 129,
          title: '【落后】C0–C8 本地化缺失内容',
          state: 'open',
          url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/issues/129',
          author: '海星',
          assignees: ['xpy'],
          priority: 'P1',
          labels: [{ name: '本地化', color: '#0e8a16' }],
          updatedAt: '2026-11-25T08:18:11Z'
        },
        {
          kind: 'pull-request',
          repoSlug: 'nanzhaigame-xpy/engine-core',
          number: 57,
          title: 'Buffer dash cancel input',
          state: 'merged',
          url: 'https://cnb.cool/nanzhaigame-xpy/engine-core/-/pulls/57',
          author: 'li',
          assignees: [],
          priority: null,
          labels: [],
          updatedAt: '2026-11-26T01:00:00Z'
        }
      ]}
      onSelectMission={() => {}}
      onSelectView={() => {}}
      onLoadMore={() => {}}
      onRetry={() => {}}
      onOpenResource={() => {}}
    />
  )
})

export const missionsResourcesForbidden = defineFixture({
  width: 1040,
  render: () => (
    <CnbMissionsPanelLazy
      state={{
        status: 'ready',
        missions: [roadmapMission],
        selectedPath: 'nanzhaigame-xpy/roadmap',
        views: [
          { id: 'v1', name: '全部', type: 'table' },
          { id: 'v2', name: '进行中', type: 'board' }
        ],
        fields: [
          { name: '优先级', interactionType: 'radio', operators: ['equal'], values: ['P0', 'P1'] }
        ],
        selectedViewId: 'v1',
        resources: [],
        nextCursor: null,
        total: 0,
        resourcesError: 'forbidden',
        canQueryResources: false
      }}
      missions={[roadmapMission]}
      views={[
        { id: 'v1', name: '全部', type: 'table' },
        { id: 'v2', name: '进行中', type: 'board' }
      ]}
      fields={[
        { name: '优先级', interactionType: 'radio', operators: ['equal'], values: ['P0', 'P1'] }
      ]}
      selectedViewId="v1"
      resources={[]}
      onSelectMission={() => {}}
      onSelectView={() => {}}
      onLoadMore={() => {}}
      onRetry={() => {}}
      onOpenResource={() => {}}
    />
  )
})
