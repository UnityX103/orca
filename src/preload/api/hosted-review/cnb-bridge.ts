import { ipcRenderer } from 'electron'
import type { CnbConnectResult, CnbCredentialStatus } from '../../../shared/cnb/cnb-credentials'
import type { CnbReviewDetails } from '../../../shared/cnb/cnb-review-details'
import type { CnbHostedReviewMutationInput } from '../../../shared/rpc-contract/source-control/hosted-review-params'
import type {
  CnbTaskDispatch,
  CnbTaskDispatchRequest,
  CnbTaskDispatchTarget
} from '../../../shared/cnb/cnb-task-dispatch'
import type {
  CnbAttachmentResult,
  CnbDetailResult,
  CnbIssueDetail,
  CnbIssueWrite,
  CnbListFilters,
  CnbMissionListResult,
  CnbMissionResourcePage,
  CnbMissionViewConfig,
  CnbPullDetail,
  CnbPullWrite,
  CnbTaskKind,
  CnbTaskListPage,
  CnbTaskRepository,
  CnbWriteResult
} from '../../../shared/cnb/cnb-tasks'

export type CnbMissionViewInput = {
  selector: { field: string; operator: string; value: string[] }[]
  sort: { field: string; order: 'asc' | 'desc' }[]
  fields: string[]
}

export type CnbTaskRepositoriesResult =
  | { ok: true; repositories: CnbTaskRepository[]; incomplete?: boolean }
  | { ok: false; reason: 'not-connected' }

export const cnbApi = {
  connect: (token: string): Promise<CnbConnectResult> => ipcRenderer.invoke('cnb:connect', token),
  disconnect: (): Promise<void> => ipcRenderer.invoke('cnb:disconnect'),
  status: (): Promise<CnbCredentialStatus> => ipcRenderer.invoke('cnb:status'),
  taskRepositories: (): Promise<CnbTaskRepositoriesResult> =>
    ipcRenderer.invoke('cnb:task-repositories'),
  taskList: (request: {
    repoIds: string[]
    kind: CnbTaskKind
    filters: CnbListFilters
    page: number
  }): Promise<CnbTaskListPage> => ipcRenderer.invoke('cnb:task-list', request),
  issueDetail: (request: {
    repoId: string
    number: number
  }): Promise<CnbDetailResult<CnbIssueDetail>> => ipcRenderer.invoke('cnb:issue-detail', request),
  pullDetail: (request: {
    repoId: string
    number: number
  }): Promise<CnbDetailResult<CnbPullDetail>> => ipcRenderer.invoke('cnb:pull-detail', request),
  getTaskDispatch: (target: CnbTaskDispatchTarget): Promise<CnbTaskDispatch | null> =>
    ipcRenderer.invoke('cnb:task-dispatch-get', target),
  startTaskDispatch: (request: CnbTaskDispatchRequest): Promise<CnbTaskDispatch> =>
    ipcRenderer.invoke('cnb:task-dispatch-start', request),
  viewer: (): Promise<{ username: string; nickname: string | null } | null> =>
    ipcRenderer.invoke('cnb:viewer'),
  labels: (request: { repoIds: string[] }): Promise<string[]> =>
    ipcRenderer.invoke('cnb:labels', request),
  missions: (request: { orgs: string[] }): Promise<CnbMissionListResult> =>
    ipcRenderer.invoke('cnb:missions', request),
  missionResources: (request: {
    missionPath: string
    cursor: string | null
    view: CnbMissionViewInput | null
  }): Promise<CnbMissionResourcePage> => ipcRenderer.invoke('cnb:mission-resources', request),
  missionViewConfig: (request: {
    missionPath: string
    viewId: string
  }): Promise<CnbMissionViewConfig | null> =>
    ipcRenderer.invoke('cnb:mission-view-config', request),
  uploadAttachment: (request: {
    repoId: string
    issueNumber: number | null
    fileName: string
    contentType: string
    base64: string
  }): Promise<CnbAttachmentResult> => ipcRenderer.invoke('cnb:upload-attachment', request),
  writeIssue: (request: {
    repoId: string
    number: number | null
    payload: CnbIssueWrite
  }): Promise<CnbWriteResult> => ipcRenderer.invoke('cnb:issue-write', request),
  writePull: (request: {
    repoId: string
    number: number
    payload: CnbPullWrite
  }): Promise<CnbWriteResult> => ipcRenderer.invoke('cnb:pull-write', request),
  reviewAction: (
    request: CnbHostedReviewMutationInput & { repoOwnerExecutionHostId: string }
  ): Promise<CnbWriteResult> => ipcRenderer.invoke('cnb:review-action', request),
  reviewDetails: (url: string): Promise<CnbReviewDetails> =>
    ipcRenderer.invoke('cnb:review-details', url)
}
