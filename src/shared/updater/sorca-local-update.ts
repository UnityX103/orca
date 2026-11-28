export type SOrcaLocalUpdateError =
  | 'invalid-package'
  | 'already-installed'
  | 'package-unavailable'
  | 'install-location'
  | 'release-update-in-progress'
  | 'signing-identity'
  | 'system-version'
  | 'prepare-failed'

export type SOrcaLocalUpdateStatus = { pendingVersion: string | null }

export type SOrcaLocalUpdateSelection =
  | { kind: 'canceled' }
  | { kind: 'staged'; version: string }
  | { kind: 'error'; reason: SOrcaLocalUpdateError }
