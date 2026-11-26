import { defineFixture } from '../../../../component-fixtures/component-fixture'
import { CnbIssueDetailPanel } from './CnbIssueDetailPanel'
import { CnbPullDetailPanel } from './CnbPullDetailPanel'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

const issueRow: CnbTaskRow = {
  repoId: 'repo-a',
  repoSlug: 'nanzhaigame-xpy/mida2025',
  number: 128,
  title: '战斗结算在低帧率下偶发丢失伤害事件',
  url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/issues/128',
  state: 'open',
  isDraft: false,
  author: 'xpy',
  assignees: ['lin'],
  labels: [{ name: 'bug', color: '#d73a4a' }],
  reviewers: [],
  checks: null,
  mergeable: null,
  updatedAt: '2026-11-24T09:20:00.000Z'
}

const pullRow: CnbTaskRow = {
  repoId: 'repo-a',
  repoSlug: 'nanzhaigame-xpy/mida2025',
  number: 57,
  title: 'Add input buffering for dash cancel',
  url: 'https://cnb.cool/nanzhaigame-xpy/mida2025/-/pulls/57',
  state: 'open',
  isDraft: false,
  author: 'li',
  assignees: [],
  labels: [],
  reviewers: [{ login: 'zhou', reviewState: 'approved' }],
  checks: 'success',
  mergeable: 'MERGEABLE',
  updatedAt: '2026-11-26T01:00:00.000Z'
}

/** Controlled responses for detail read + write; no network, so the fixture is deterministic. */
const fakeCnbApi = {
  issueDetail: async () => ({
    ok: true,
    detail: {
      number: 128,
      title: issueRow.title,
      body: '**复现步骤**\n\n1. 低帧率下连招\n2. 结算丢失',
      state: 'open',
      author: 'xpy',
      assignees: ['lin'],
      labels: [{ name: 'bug', color: '#d73a4a' }],
      comments: [
        {
          id: 'c1',
          author: 'zhou',
          body: '已复现，定位在结算队列。',
          createdAt: '2026-11-24T10:00:00Z'
        }
      ],
      url: issueRow.url,
      updatedAt: issueRow.updatedAt,
      canEdit: true
    }
  }),
  pullDetail: async () => ({
    ok: true,
    detail: {
      number: 57,
      title: pullRow.title,
      body: 'Buffers dash input for 120ms.',
      state: 'open',
      isDraft: false,
      author: 'li',
      headRef: 'feat/dash-buffer',
      baseRef: 'main',
      headSha: 'abc123',
      reviewers: [{ login: 'zhou', reviewState: 'approved' }],
      labels: [],
      checks: 'success',
      checksSummary: { total: 3, passed: 3, failed: 0, pending: 0 },
      mergeable: 'MERGEABLE',
      comments: [{ id: 'p1', author: 'zhou', body: 'LGTM', createdAt: '2026-11-26T02:00:00Z' }],
      reviews: [{ id: 'r1', author: 'zhou', state: 'approved', body: '' }],
      files: [
        {
          path: 'src/input/dash.ts',
          additions: 12,
          deletions: 3,
          patch: '+ buffer\n- direct',
          patchTruncated: false
        }
      ],
      filesTruncated: false,
      commits: [
        { sha: 'abc12345', message: 'feat: buffer dash input', author: 'li', committedAt: null }
      ],
      url: pullRow.url,
      updatedAt: pullRow.updatedAt
    }
  }),
  writeIssue: async () => ({ ok: true }),
  writePull: async () => ({ ok: true })
}

// The two detail panels only call these four methods; the double stands in for the rest of the bridge.
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: panels touch only these four bridge methods
const api: CnbApi = fakeCnbApi as unknown as CnbApi

export const issueDetail = defineFixture({
  width: 900,
  render: () => (
    <CnbIssueDetailPanel
      api={api}
      row={issueRow}
      onBack={() => {}}
      onChanged={() => {}}
      onStartWorkspace={() => {}}
    />
  )
})

export const pullDetailConversation = defineFixture({
  width: 900,
  render: () => (
    <CnbPullDetailPanel
      api={api}
      row={pullRow}
      onBack={() => {}}
      onChanged={() => {}}
      onStartWorkspace={() => {}}
    />
  )
})

export const pullDetailFiles = defineFixture({
  width: 900,
  interact: async (frame) => {
    const trigger = [...frame.querySelectorAll('button')].find((node) =>
      (node.textContent ?? '').startsWith('Files')
    )
    if (!trigger) {
      return
    }
    // Radix tabs activate on mousedown+click; focus first so the keyboard fallback also lands.
    trigger.focus()
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
  },
  render: () => (
    <CnbPullDetailPanel
      api={api}
      row={pullRow}
      onBack={() => {}}
      onChanged={() => {}}
      onStartWorkspace={() => {}}
    />
  )
})
