export type CnbCredentialStatus = {
  source: 'none' | 'stored' | 'environment'
}

export type CnbConnectResult =
  | { ok: true }
  | { ok: false; reason: 'invalidToken' | 'rejected' | 'unreachable' | 'storageUnavailable' }
