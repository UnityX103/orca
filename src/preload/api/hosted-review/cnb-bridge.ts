import { ipcRenderer } from 'electron'
import type { CnbConnectResult, CnbCredentialStatus } from '../../../shared/cnb/cnb-credentials'
import type { CnbReviewDetails } from '../../../shared/cnb/cnb-review-details'

export const cnbApi = {
  connect: (token: string): Promise<CnbConnectResult> => ipcRenderer.invoke('cnb:connect', token),
  disconnect: (): Promise<void> => ipcRenderer.invoke('cnb:disconnect'),
  status: (): Promise<CnbCredentialStatus> => ipcRenderer.invoke('cnb:status'),
  reviewDetails: (url: string): Promise<CnbReviewDetails> =>
    ipcRenderer.invoke('cnb:review-details', url)
}
