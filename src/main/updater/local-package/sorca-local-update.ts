import { app, type BrowserWindow } from 'electron'
import type {
  SOrcaLocalUpdateSelection,
  SOrcaLocalUpdateStatus
} from '../../../shared/updater/sorca-local-update'
import { showSingleFlightOpenDialog } from '../../ipc/dialogs/single-flight-open-dialog'
import { isSOrcaVersion } from '../../../shared/app-lifecycle/identity/sorca-build-version'
import {
  readSOrcaDevelopmentPackage,
  type SOrcaDevelopmentPackage
} from './sorca-development-manifest'
import {
  discardStagedSOrcaPackage,
  getSOrcaAppBundle,
  installStagedSOrcaPackage,
  SOrcaPackageError,
  stageSOrcaMacPackage,
  type StagedSOrcaPackage
} from './sorca-mac-update-package'

let pending: StagedSOrcaPackage | undefined
let selecting = false
let preparation: { done: Promise<SOrcaLocalUpdateSelection>; abort: AbortController } | undefined
let closing = false

function getTarget(): string | null {
  return process.platform === 'darwin' &&
    process.arch === 'arm64' &&
    app.isPackaged &&
    isSOrcaVersion(app.getVersion())
    ? getSOrcaAppBundle(app.getPath('exe'))
    : null
}

export function getSOrcaLocalUpdateStatus(): SOrcaLocalUpdateStatus | null {
  return getTarget() ? { pendingVersion: pending?.version ?? null } : null
}

async function preparePackage(
  source: string,
  target: string,
  expected: SOrcaDevelopmentPackage,
  signal: AbortSignal
): Promise<SOrcaLocalUpdateSelection> {
  try {
    const staged = await stageSOrcaMacPackage({
      source,
      target,
      installedVersion: app.getVersion(),
      expected,
      signal
    })
    if (signal.aborted) {
      await discardStagedSOrcaPackage(staged.root).catch(console.warn)
      return { kind: 'canceled' }
    }
    const previous = pending
    pending = staged
    if (previous) {
      await discardStagedSOrcaPackage(previous.root).catch(console.warn)
    }
    return { kind: 'staged', version: staged.version }
  } catch (error) {
    if (signal.aborted) {
      return { kind: 'canceled' }
    }
    if (error instanceof SOrcaPackageError) {
      return { kind: 'error', reason: error.reason }
    }
    console.warn('[sorca-local-update] Could not prepare package', error)
    return { kind: 'error', reason: 'prepare-failed' }
  }
}

export async function chooseSOrcaLocalUpdatePackage(
  window: BrowserWindow | null
): Promise<SOrcaLocalUpdateSelection> {
  const target = getTarget()
  if (!target) {
    return { kind: 'error', reason: 'install-location' }
  }
  if (closing || selecting) {
    return { kind: 'canceled' }
  }
  selecting = true
  try {
    const expected = await readSOrcaDevelopmentPackage()
    if (!expected) {
      return { kind: 'error', reason: 'package-unavailable' }
    }
    const selection = await showSingleFlightOpenDialog(
      {
        defaultPath: expected.path,
        properties: ['openFile'],
        filters: [{ name: 'Orca (.dmg)', extensions: ['dmg'] }]
      },
      window
    )
    const source = selection.filePaths[0]
    if (closing || selection.canceled || !source) {
      return { kind: 'canceled' }
    }
    const abort = new AbortController()
    const done = preparePackage(source, target, expected, abort.signal)
    preparation = { done, abort }
    return await done
  } finally {
    preparation = undefined
    selecting = false
  }
}

export async function clearSOrcaLocalUpdatePackage(): Promise<SOrcaLocalUpdateStatus | null> {
  if (!closing && !selecting && pending) {
    const staged = pending
    pending = undefined
    await discardStagedSOrcaPackage(staged.root).catch(console.warn)
  }
  return getSOrcaLocalUpdateStatus()
}

export async function applySOrcaLocalUpdateOnQuit(): Promise<void> {
  closing = true
  if (preparation) {
    preparation.abort.abort()
    await preparation.done
  }
  if (pending) {
    const staged = pending
    pending = undefined
    await installStagedSOrcaPackage(staged, app.getVersion())
  }
}
