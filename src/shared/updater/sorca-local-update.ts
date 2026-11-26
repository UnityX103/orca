export type SOrcaLocalUpdateError =
  | 'invalid-package'
  | 'already-installed'
  | 'package-unavailable'
  | 'install-location'
  | 'prepare-failed'

export type SOrcaLocalUpdateStatus = { pendingVersion: string | null }

export type SOrcaLocalUpdateSelection =
  | { kind: 'canceled' }
  | { kind: 'staged'; version: string }
  | { kind: 'error'; reason: SOrcaLocalUpdateError }
