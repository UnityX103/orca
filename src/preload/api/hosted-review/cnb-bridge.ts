import { ipcRenderer } from 'electron'
import type { CnbConnectResult, CnbCredentialStatus } from '../../../shared/cnb/cnb-credentials'
import type { CnbReviewDetails } from '../../../shared/cnb/cnb-review-details'
import type { CnbTaskKind, CnbTaskPage, CnbTaskRepository } from '../../../shared/cnb/cnb-tasks'

export const cnbApi = {
  connect: (token: string): Promise<CnbConnectResult> => ipcRenderer.invoke('cnb:connect', token),
  disconnect: (): Promise<void> => ipcRenderer.invoke('cnb:disconnect'),
  status: (): Promise<CnbCredentialStatus> => ipcRenderer.invoke('cnb:status'),
  taskRepositories: (): Promise<{ repositories: CnbTaskRepository[]; incomplete: boolean }> =>
    ipcRenderer.invoke('cnb:task-repositories'),
  taskPage: (request: { repoId: string; kind: CnbTaskKind; page: number }): Promise<CnbTaskPage> =>
    ipcRenderer.invoke('cnb:task-page', request),
  reviewDetails: (url: string): Promise<CnbReviewDetails> =>
    ipcRenderer.invoke('cnb:review-details', url)
}
