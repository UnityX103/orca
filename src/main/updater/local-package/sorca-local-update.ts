import { app, net, type BrowserWindow } from 'electron'
import { Readable } from 'node:stream'
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
  SOrcaPackageError,
  stageSOrcaMacPackage,
  type StagedSOrcaPackage
} from './sorca-mac-update-package'

export type PublishedUpdateInstallPolicy = (restartRequested: boolean) => boolean

type PendingPackage = {
  staged: StagedSOrcaPackage
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

async function preparePackage(
  options: Parameters<typeof stageSOrcaMacPackage>[0],
  installRelease?: PublishedUpdateInstallPolicy
): Promise<SOrcaLocalUpdateSelection> {
  const { signal } = options
  try {
    const staged = await stageSOrcaMacPackage(options)
    if (signal.aborted) {
      await discardStagedSOrcaPackage(staged.root).catch(console.warn)
      return { kind: 'canceled' }
    }
    const previous = pending
    pending = { staged, installRelease }
    if (previous) {
      await discardStagedSOrcaPackage(previous.staged.root).catch(console.warn)
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
    const done = preparePackage({
      source,
      target,
      installedVersion: app.getVersion(),
      expected,
      signal: abort.signal
    })
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
  const target = getTarget()
  const asset = build.macUpdate
  if (!target || !asset) {
    return Promise.resolve({ kind: 'error', reason: 'package-unavailable' })
  }
  selecting = true
  const abort = new AbortController()
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15 * 60 * 1000)])
  const done = preparePackage(
    {
      source: {
        open: async () => {
          const response = await net.fetch(asset.url, { signal, credentials: 'omit' })
          const body = response.body
          if (!response.ok || !body) {
            await body?.cancel().catch(() => {})
            throw new Error(`Orca update download returned HTTP ${response.status}`)
          }
          return Readable.from(
            (async function* () {
              const reader = body.getReader()
              try {
                for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
                  yield chunk.value
                }
              } finally {
                await reader.cancel().catch(() => {})
                reader.releaseLock()
              }
            })(),
            { objectMode: false }
          )
        },
        onProgress
      },
      target,
      installedVersion: app.getVersion(),
      expected: { version: build.version, size: asset.size, sha256: asset.sha256 },
      signal
    },
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
    await discardStagedSOrcaPackage(staged.root)
  }
}

export async function clearSOrcaLocalUpdatePackage(): Promise<SOrcaLocalUpdateStatus | null> {
  if (!closing && !selecting && pending && !pending.installRelease) {
    const { staged } = pending
    pending = undefined
    await discardStagedSOrcaPackage(staged.root).catch(console.warn)
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
