import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import type { CnbConnectResult, CnbCredentialStatus } from '../../shared/cnb/cnb-credentials'
import { getSecretStore } from '../../shared/secure-storage/secret-store'
import { inCredentialFileOrder } from '../credentials/credential-file-io'
import { writeCredentialFileAtomic } from '../credentials/integration-credential-file'
import { createIntegrationTokenFileCache } from '../credentials/integration-token-file-cache'
import { cnbRequest } from './request'

const id = 'cnb'
const credentialPath = () => join(homedir(), '.orca', 'cnb-credential.enc')
const storedToken = createIntegrationTokenFileCache({ service: 'CNB', filePath: credentialPath })

function environmentToken(): string | null {
  return process.env.ORCA_CNB_TOKEN?.trim() || process.env.CNB_TOKEN?.trim() || null
}

export async function getCnbCredentialToken(): Promise<string | null> {
  return environmentToken() ?? storedToken.read(id)
}

export async function requireCnbCredentialToken(): Promise<string> {
  const token = await getCnbCredentialToken()
  if (!token) {
    throw new Error('Connect CNB in Settings > Integrations.')
  }
  return token
}

export async function getCnbCredentialStatus(): Promise<CnbCredentialStatus> {
  if (environmentToken()) {
    return { source: 'environment' }
  }
  return { source: (await storedToken.has(id)) ? 'stored' : 'none' }
}

export async function connectCnb(value: unknown): Promise<CnbConnectResult> {
  const token = typeof value === 'string' ? value.trim() : ''
  if (!/^[!-~]{1,2048}$/.test(token)) {
    return { ok: false, reason: 'invalidToken' }
  }
  try {
    const response = await cnbRequest('/user', token)
    if (!response.ok) {
      await response.body?.cancel()
      const rejected = response.status === 401 || response.status === 403
      return { ok: false, reason: rejected ? 'rejected' : 'unreachable' }
    }
    const user: unknown = await response.json()
    if (
      !user ||
      typeof user !== 'object' ||
      !('username' in user) ||
      typeof user.username !== 'string' ||
      !user.username
    ) {
      return { ok: false, reason: 'unreachable' }
    }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }

  const secrets = getSecretStore()
  if (!secrets.isEncryptionAvailable()) {
    return { ok: false, reason: 'storageUnavailable' }
  }
  const file = credentialPath()
  try {
    await inCredentialFileOrder(`${file}.mutation`, async () => {
      await mkdir(join(homedir(), '.orca'), { recursive: true, mode: 0o700 })
      await writeCredentialFileAtomic(file, secrets.encryptString(token), undefined, true)
      storedToken.forget(id)
    })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'storageUnavailable' }
  }
}

export async function disconnectCnb(): Promise<void> {
  const file = credentialPath()
  await inCredentialFileOrder(`${file}.mutation`, async () => {
    await rm(file, { force: true })
    storedToken.forget(id)
  })
}
