import { app, type BrowserWindow } from 'electron'
import type {
  SOrcaLocalUpdateSelection,
  SOrcaLocalUpdateStatus
} from '../../../shared/updater/sorca-local-update'
import { showSingleFlightOpenDialog } from '../../ipc/dialogs/single-flight-open-dialog'
import { isSOrcaVersion } from '../../../shared/app-lifecycle/identity/sorca-build-version'
import { relaunchApp } from '../../startup/quit/app-relaunch'
import { getMacUpdateRunningInstances } from '../mac-install/macos-update-running-instances'
import type { SOrcaReleaseBuild } from '../releases/sorca-release-feed'
import { readSOrcaDevelopmentPackage } from './sorca-development-manifest'
import {
  discardStagedSOrcaPackage,
  getSOrcaAppBundle,
  installStagedSOrcaPackage,
  stageSOrcaMacPackage,
  type StagedSOrcaPackage
} from './sorca-mac-update-package'

import { SOrcaPackageError } from './sorca-verified-package'
import { sorcaReleasePackageSource } from './sorca-release-package-source'
import {
  applySOrcaWindowsPackage,
  discardSOrcaWindowsPackage,
  stageSOrcaWindowsPackage,
  type StagedSOrcaWindowsPackage
} from './sorca-windows-update-package'

type StagedPackage = StagedSOrcaPackage | StagedSOrcaWindowsPackage

export type PublishedUpdateInstallPolicy = (restartRequested: boolean) => boolean

type PendingPackage = {
  staged: StagedPackage
  installRelease?: PublishedUpdateInstallPolicy
  restartAfterInstall?: boolean
}

let pending: PendingPackage | undefined
let selecting = false
let preparation:
  | {
      done: Promise<SOrcaLocalUpdateSelection>
      abort: AbortController
      installRelease?: PublishedUpdateInstallPolicy
    }
  | undefined
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
  return getTarget()
    ? { pendingVersion: pending?.installRelease ? null : (pending?.staged.version ?? null) }
    : null
}

function discardStagedPackage(staged: StagedPackage): Promise<void> {
  return 'installer' in staged
    ? discardSOrcaWindowsPackage(staged.root)
    : discardStagedSOrcaPackage(staged.root)
}

async function preparePackage(
  prepare: () => Promise<StagedPackage>,
  signal: AbortSignal,
  installRelease?: PublishedUpdateInstallPolicy
): Promise<SOrcaLocalUpdateSelection> {
  try {
    const staged = await prepare()
    if (signal.aborted) {
      await discardStagedPackage(staged).catch(console.warn)
      return { kind: 'canceled' }
    }
    const previous = pending
    pending = { staged, installRelease }
    if (previous) {
      await discardStagedPackage(previous.staged).catch(console.warn)
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
  if (pending?.installRelease || preparation?.installRelease) {
    return { kind: 'error', reason: 'release-update-in-progress' }
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
    const signal = abort.signal
    const done = preparePackage(
      () =>
        stageSOrcaMacPackage({
          source,
          target,
          installedVersion: app.getVersion(),
          expected,
          signal
        }),
      signal
    )
    preparation = { done, abort }
    return await done
  } finally {
    preparation = undefined
    selecting = false
  }
}

export function stageSOrcaPublishedUpdate(
  build: SOrcaReleaseBuild,
  onProgress: (percent: number) => void,
  installRelease: PublishedUpdateInstallPolicy
): Promise<SOrcaLocalUpdateSelection> | null {
  if (closing || selecting || pending) {
    return null
  }
  const macTarget = getTarget()
  const asset = process.platform === 'win32' ? build.windowsUpdate : build.macUpdate
  if (!asset || (!macTarget && process.platform !== 'win32')) {
    return Promise.resolve({ kind: 'error', reason: 'package-unavailable' })
  }
  selecting = true
  const abort = new AbortController()
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15 * 60 * 1000)])
  const source = sorcaReleasePackageSource(asset, signal, onProgress)
  const expected = { version: build.version, size: asset.size, sha256: asset.sha256 }
  const done = preparePackage(
    () =>
      macTarget
        ? stageSOrcaMacPackage({
            source,
            expected,
            signal,
            target: macTarget,
            installedVersion: app.getVersion()
          })
        : stageSOrcaWindowsPackage({
            source,
            expected,
            signal,
            version: build.version,
            executable: app.getPath('exe'),
            userDataPath: app.getPath('userData')
          }),
    signal,
    installRelease
  )
  preparation = { done, abort, installRelease }
  return done
    .then((result): SOrcaLocalUpdateSelection => {
      if (result.kind === 'canceled' && !abort.signal.aborted) {
        return { kind: 'error', reason: 'prepare-failed' }
      }
      return result
    })
    .finally(() => {
      preparation = undefined
      selecting = false
    })
}

export function hasStagedSOrcaPublishedUpdate(
  installRelease: PublishedUpdateInstallPolicy
): boolean {
  return pending?.installRelease === installRelease
}

export function setSOrcaPublishedUpdateRestart(
  installRelease: PublishedUpdateInstallPolicy,
  requested: boolean
): boolean {
  if (closing || pending?.installRelease !== installRelease) {
    return false
  }
  pending.restartAfterInstall = requested
  return true
}

export async function discardSOrcaPublishedUpdate(
  installRelease: PublishedUpdateInstallPolicy
): Promise<void> {
  if (closing) {
    return
  }
  if (preparation?.installRelease === installRelease) {
    preparation.abort.abort()
  }
  if (pending?.installRelease === installRelease) {
    const { staged } = pending
    pending = undefined
    await discardStagedPackage(staged)
  }
}

export async function clearSOrcaLocalUpdatePackage(): Promise<SOrcaLocalUpdateStatus | null> {
  if (!closing && !selecting && pending && !pending.installRelease) {
    const { staged } = pending
    pending = undefined
    await discardStagedPackage(staged).catch(console.warn)
  }
  return getSOrcaLocalUpdateStatus()
}

export async function applyStagedSOrcaUpdateOnQuit(): Promise<void> {
  closing = true
  if (preparation) {
    preparation.abort.abort()
    await preparation.done
  }
  if (pending) {
    const { staged, installRelease, restartAfterInstall = false } = pending
    pending = undefined
    if ('installer' in staged) {
      await applySOrcaWindowsPackage(
        staged,
        app.getPath('exe'),
        app.getVersion(),
        restartAfterInstall,
        () => installRelease?.(restartAfterInstall) === true
      )
      return
    }
    const installed = await installStagedSOrcaPackage(
      staged,
      app.getVersion(),
      installRelease
        ? async () => {
            if (!installRelease(restartAfterInstall)) {
              return false
            }
            if ((await getMacUpdateRunningInstances(app.getPath('exe'))).length > 0) {
              console.info('[sorca-update] Installation deferred because another Orca is running.')
              return false
            }
            return installRelease(restartAfterInstall)
          }
        : undefined
    )
    if (installed && (!installRelease || restartAfterInstall)) {
      relaunchApp('local-update', { version: staged.version }, { args: process.argv.slice(1) })
    }
  }
}
