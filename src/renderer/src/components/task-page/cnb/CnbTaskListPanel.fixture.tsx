import { defineFixture } from '../../../component-fixtures/component-fixture'
import { ConfirmationDialogProvider } from '../../dismiss/confirmation/confirmation-dialog'
import { CnbTaskListPanel } from './CnbTaskListPanel'
import type { CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'

// The inline cells use the confirmation dialog (merge) and CNB bridge (members/checks/labels).
function Panel(props: Parameters<typeof CnbTaskListPanel>[0]): React.JSX.Element {
  return (
    <ConfirmationDialogProvider>
      <CnbTaskListPanel {...props} />
    </ConfirmationDialogProvider>
  )
}

const noop = (): void => {}
const neverAttached = (): boolean => false

const baseProps = {
  showRepo: false,
  api: undefined,
  loading: false,
  error: null,
  needsConnect: false,
  empty: { title: '', description: '' },
  scopeNotice: null,
  failures: [],
  page: 1,
  pageCount: null,
  hasNextPage: false,
  isWorkspaceAttached: neverAttached,
  onPageChange: noop,
  onOpen: noop,
  onOpenPullChecks: noop,
  onStartWorkspace: noop,
  onUseNewWorkspace: noop,
  onRetry: noop,
  onOpenIntegrations: noop,
  onChanged: noop
} satisfies Partial<Parameters<typeof CnbTaskListPanel>[0]>

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
    <Panel
      {...baseProps}
      kind="issues"
      rows={rows}
      showRepo
      empty={{ title: 'No issues', description: '' }}
      pageCount={3}
      hasNextPage
    />
  )
})

export const loading = defineFixture({
  width: 1040,
  render: () => (
    <Panel
      {...baseProps}
      kind="pull-requests"
      rows={[]}
      loading
      empty={{ title: 'No pull requests', description: '' }}
    />
  )
})

export const emptyWithNoRepo = defineFixture({
  width: 1040,
  render: () => (
    <Panel
      {...baseProps}
      kind="issues"
      rows={[]}
      empty={{
        title: 'No issues match these filters.',
        description: 'Adjust the filters, project selection, or search to widen the results.'
      }}
    />
  )
})

export const perRepoFailure = defineFixture({
  width: 1040,
  render: () => (
    <Panel
      {...baseProps}
      kind="issues"
      rows={rows.slice(0, 1)}
      showRepo
      empty={{ title: 'No issues', description: '' }}
      scopeNotice="Search scanned the 4 newest pull request pages."
      failures={[{ key: 'repo-b', message: 'Could not load nanzhaigame-xpy/engine-core.' }]}
      page={2}
      pageCount={5}
      hasNextPage
    />
  )
})

export const connectRequired = defineFixture({
  width: 1040,
  render: () => (
    <Panel
      {...baseProps}
      kind="issues"
      rows={[]}
      error="Connect CNB in Integrations to browse repository tasks."
      needsConnect
      empty={{ title: '', description: '' }}
    />
  )
})

const pullRows: CnbTaskRow[] = [
  {
    repoId: 'repo-a',
    repoSlug: 'nanzhaigame-xpy/mida2025',
    number: 312,
    title: 'Fix dash cancel buffering',
    url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/pulls/312',
    state: 'open',
    isDraft: false,
    author: 'li',
    assignees: ['li'],
    labels: [{ name: 'bug', color: '#d73a4a' }],
    reviewers: [
      { login: 'xpy', reviewState: 'approved' },
      { login: 'lin', reviewState: 'changes_requested' }
    ],
    checks: null,
    mergeable: 'MERGEABLE',
    updatedAt: '2026-11-26T09:00:00.000Z'
  },
  {
    repoId: 'repo-a',
    repoSlug: 'nanzhaigame-xpy/mida2025',
    number: 305,
    title: 'Conflicting change to battle loop',
    url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/pulls/305',
    state: 'open',
    isDraft: false,
    author: 'wang',
    assignees: [],
    labels: [],
    reviewers: [{ login: 'xpy', reviewState: null }],
    checks: null,
    mergeable: 'CONFLICTING',
    updatedAt: '2026-11-24T03:00:00.000Z'
  },
  {
    repoId: 'repo-a',
    repoSlug: 'nanzhaigame-xpy/mida2025',
    number: 300,
    title: 'Closed but reopenable pull request',
    url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/pulls/300',
    state: 'closed',
    isDraft: false,
    author: 'lin',
    assignees: [],
    labels: [],
    reviewers: [],
    checks: null,
    mergeable: null,
    updatedAt: '2026-11-20T03:00:00.000Z'
  }
]

type CnbApi = NonNullable<Window['api']['cnb']>

// A mock CNB bridge: proves the cells call the real write/preload shapes with the row's numbers.
// Only the members/labels/checks reads and the two writers are exercised by these fixtures.
const mockCnbApi = (): CnbApi => {
  const api = {
    members: async () => ({
      ok: true as const,
      members: [
        { login: 'xpy', nickname: 'Xpy' },
        { login: 'lin', nickname: null },
        { login: 'wang', nickname: null }
      ],
      truncated: false
    }),
    labels: async () => ['bug', 'hotfix', 'localization'],
    pullChecks: async () => ({
      ok: true as const,
      checks: 'failure' as const,
      summary: { total: 3, passed: 1, failed: 1, pending: 1 }
    }),
    writePull: async () => ({ ok: true as const }),
    writeIssue: async () => ({ ok: true as const })
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fixture stub covers only the members/labels/checks/write surface the rows call; the rest of the bridge is unused here.
  return api as unknown as CnbApi
}

export const pullsInline = defineFixture({
  width: 1120,
  render: () => (
    <Panel
      {...baseProps}
      kind="pull-requests"
      rows={pullRows}
      showRepo={false}
      api={mockCnbApi()}
    />
  ),
  interact: async (frame) => {
    // Radix dropdowns open on pointerdown; the merge menu shows the three merge styles.
    const trigger = frame.querySelector<HTMLButtonElement>(
      '[data-cnb-merge-trigger]:not([disabled])'
    )
    trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
})

export const issuesInline = defineFixture({
  width: 1040,
  render: () => (
    <Panel {...baseProps} kind="issues" rows={rows} showRepo={false} api={mockCnbApi()} />
  ),
  interact: async (frame) => {
    // Open the status menu on the first issue row to capture the close-reason choices.
    const trigger = frame.querySelector<HTMLButtonElement>('[data-cnb-status-trigger]')
    trigger?.click()
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
})

export const assigneePickerOpen = defineFixture({
  width: 1040,
  render: () => <Panel {...baseProps} kind="issues" rows={rows.slice(0, 1)} api={mockCnbApi()} />,
  interact: async (frame) => {
    // The assignee trigger button (popover) opens on click.
    const trigger = frame.querySelector<HTMLButtonElement>('[data-cnb-people-trigger]')
    trigger?.click()
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
})

export const labelsPickerOpen = defineFixture({
  width: 1040,
  render: () => <Panel {...baseProps} kind="issues" rows={rows.slice(0, 1)} api={mockCnbApi()} />,
  interact: async (frame) => {
    const trigger = frame.querySelector<HTMLButtonElement>('[data-cnb-labels-trigger]')
    trigger?.click()
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
})

export const issuesNarrow = defineFixture({
  width: 560,
  render: () => <Panel {...baseProps} kind="issues" rows={rows} api={mockCnbApi()} />
})
