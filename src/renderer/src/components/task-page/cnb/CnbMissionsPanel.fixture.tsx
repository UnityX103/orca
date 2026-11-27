import { defineFixture } from '../../../component-fixtures/component-fixture'
import { CnbMissionsPanel } from './CnbMissionsPanel'

export const missionsEmpty = defineFixture({
  width: 1040,
  render: () => (
    <CnbMissionsPanel
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
    <CnbMissionsPanel
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
    <CnbMissionsPanel
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
