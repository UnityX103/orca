import { ipcMain } from 'electron'
import { connectCnb, disconnectCnb, getCnbCredentialStatus } from '../../cnb/credentials'
import { readCnbReviewDetails } from '../../cnb/pull-requests'

export function registerCnbHandlers(): void {
  ipcMain.handle('cnb:connect', (_event, token: unknown) => connectCnb(token))
  ipcMain.handle('cnb:disconnect', () => disconnectCnb())
  ipcMain.handle('cnb:status', () => getCnbCredentialStatus())
  ipcMain.handle('cnb:review-details', (_event, url: unknown) => readCnbReviewDetails(url))
}
