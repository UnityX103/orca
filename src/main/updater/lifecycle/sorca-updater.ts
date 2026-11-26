import { app, shell, type BrowserWindow } from 'electron'
import type { ReleaseBuild, ReleaseChannel } from '../../../shared/updater/release-channel'
import type { UpdateCheckOptions } from '../../../shared/updater/update-status-types'
import {
  isSOrcaVersion,
  SORCA_DEVELOPMENT_VERSION
} from '../../../shared/app-lifecycle/identity/sorca-build-version'
import type { ReleaseBuildListOptions } from '../releases/updater-release-build-cache'
import { compareSOrcaBuilds, listSOrcaReleaseBuilds } from '../releases/sorca-release-feed'
import { UpdaterSetup, type UpdaterSetupOptions } from './updater-setup'

export class SOrcaUpdater extends UpdaterSetup {
  private checkingFork = false
  private offeredInstaller: ReleaseBuild | undefined

  private get usesFork(): boolean {
    return app.isPackaged && isSOrcaVersion(app.getVersion())
  }

  override setupAutoUpdater(mainWindow: BrowserWindow | null, opts?: UpdaterSetupOptions): void {
    if (!this.usesFork) {
      return super.setupAutoUpdater(mainWindow, opts)
    }
    this.getMainWindow = opts?.getMainWindow ?? (() => mainWindow)
    this.checkFork(false)
  }

  override checkForUpdates(): void {
    if (!this.usesFork) {
      return super.checkForUpdates()
    }
    this.checkFork(false)
  }

  override checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    if (!this.usesFork) {
      return super.checkForUpdatesFromMenu(options)
    }
    this.checkFork(true, options?.targetTag)
  }

  override listAvailableReleaseBuilds(
    channel: ReleaseChannel,
    options?: ReleaseBuildListOptions
  ): Promise<ReleaseBuild[]> {
    if (!this.usesFork) {
      return super.listAvailableReleaseBuilds(channel, options)
    }
    return channel === 'stable' ? listSOrcaReleaseBuilds() : Promise.resolve([])
  }

  override downloadUpdate(automatic = false): void {
    if (!this.usesFork) {
      return super.downloadUpdate(automatic)
    }
    const url = this.offeredInstaller?.installerUrl
    if (!automatic && url && this.currentStatus.state === 'available') {
      void shell.openExternal(url).catch((error: unknown) => {
        this.sendStatus({ state: 'error', message: String(error), failurePhase: 'download' })
      })
    }
  }

  private checkFork(userInitiated: boolean, tag?: string): void {
    if (!tag && SORCA_DEVELOPMENT_VERSION.test(app.getVersion())) {
      if (userInitiated) {
        this.sendStatus({ state: 'not-available', userInitiated })
      }
      return
    }
    if (this.checkingFork) {
      return
    }
    this.checkingFork = true
    this.offeredInstaller = undefined
    this.sendStatus({ state: 'checking', userInitiated })
    void listSOrcaReleaseBuilds()
      .then((builds) => {
        const available = tag
          ? builds.find((build) => build.tag === tag)
          : builds.find((build) => compareSOrcaBuilds(build.version, app.getVersion()) > 0)
        this.offeredInstaller = available
        this.sendStatus(
          available
            ? {
                state: 'available',
                version: available.version,
                releaseUrl: available.releaseUrl,
                changelog: null
              }
            : { state: 'not-available', userInitiated }
        )
      })
      .catch((error: unknown) => {
        this.sendStatus({ state: 'error', message: String(error), userInitiated })
      })
      .finally(() => {
        this.checkingFork = false
      })
  }
}
