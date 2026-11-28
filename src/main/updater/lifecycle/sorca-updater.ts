import { app, shell, type BrowserWindow } from 'electron'
import type { ReleaseBuild, ReleaseChannel } from '../../../shared/updater/release-channel'
import type { UpdateCheckOptions } from '../../../shared/updater/update-status-types'
import {
  isSOrcaVersion,
  SORCA_DEVELOPMENT_VERSION
} from '../../../shared/app-lifecycle/identity/sorca-build-version'
import type { ReleaseBuildListOptions } from '../releases/updater-release-build-cache'
import { compareSOrcaBuilds } from '../releases/sorca-build-order'
import { listSOrcaReleaseBuilds, type SOrcaReleaseBuild } from '../releases/sorca-release-feed'
import {
  AUTO_UPDATE_CHECK_INTERVAL_MS,
  AUTO_UPDATE_RETRY_INTERVAL_MS,
  type UpdateInstallTrigger
} from './updater-state'
import { updateDelayDaysToMs } from '../../../shared/updater/update-delay'
import { updaterCodedMessage } from '../../../shared/updater/updater-failure-copy'
import { managesUpdates } from '../releases/updater-release-policy'
import { getDelayedUpdateWakeDelayMs, toDelayedUpdate } from '../releases/updater-release-delay'
import { UpdaterCodedError, updaterErrorMessage } from './updater-coded-error'
import type { UpdaterSetupOptions } from './updater-setup'
import { SOrcaReleaseUpdater } from './sorca-release-updater'
import { clearCompletedSOrcaWindowsUpdates } from '../local-package/sorca-windows-update-package'

export class SOrcaUpdater extends SOrcaReleaseUpdater {
  private forkInitialized = false
  private checkingFork = false
  private offeredInstaller: SOrcaReleaseBuild | undefined

  private get usesFork(): boolean {
    return app.isPackaged && isSOrcaVersion(app.getVersion())
  }

  override setupAutoUpdater(mainWindow: BrowserWindow | null, opts?: UpdaterSetupOptions): void {
    if (!this.usesFork) {
      return super.setupAutoUpdater(mainWindow, opts)
    }
    this.getMainWindow = opts?.getMainWindow ?? (() => mainWindow)
    this.getAutomaticUpdates = opts?.getAutomaticUpdates ?? null
    this.getUpdateDelayDays = opts?.getUpdateDelayDays ?? null
    this.getTeamUpdatePolicy = opts?.getTeamUpdatePolicy ?? null
    this.onBeforeQuitCleanup = opts?.onBeforeQuit ?? null
    this.onBeforeQuitFailure = opts?.onBeforeQuitFailure ?? 'continue'
    this.updateInstallMode = opts?.installMode ?? 'interactive'
    if (!this.forkInitialized) {
      this.forkInitialized = true
      if (process.platform === 'win32') {
        void clearCompletedSOrcaWindowsUpdates(app.getPath('userData')).catch(console.warn)
      }
      let managed = managesUpdates(this.getTeamUpdatePolicy?.())
      opts?.onTeamUpdatePolicyChanged?.(() => {
        const next = managesUpdates(this.getTeamUpdatePolicy?.())
        if (next !== managed) {
          managed = next
          if (!this.holdForkUpdateForTeam()) {
            this.runBackgroundUpdateCheck()
          }
        }
      })
      this.runBackgroundUpdateCheck()
    }
  }

  override checkForUpdates(): void {
    if (!this.usesFork) {
      return super.checkForUpdates()
    }
    this.runBackgroundUpdateCheck()
  }

  override checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    if (!this.usesFork) {
      return super.checkForUpdatesFromMenu(options)
    }
    this.checkFork(true, options)
  }

  protected override runBackgroundUpdateCheck(): boolean {
    return this.usesFork ? this.checkFork(false) : super.runBackgroundUpdateCheck()
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
    if (this.holdForkUpdateForTeam(!automatic) || this.stagedRelease) {
      return
    }
    const offer = this.offeredInstaller
    const state = this.currentStatus
    if (
      !offer ||
      (state.state !== 'available' &&
        !(state.state === 'error' && state.failurePhase === 'download' && state.retryable))
    ) {
      return
    }
    if (
      this.hasStagedReleaseAsset(offer) &&
      compareSOrcaBuilds(offer.version, app.getVersion()) > 0
    ) {
      void this.downloadStagedRelease(offer, automatic)
    } else if (!automatic && offer.installerUrl && this.updateInstallMode === 'interactive') {
      void shell.openExternal(offer.installerUrl).catch((error: unknown) => {
        this.sendStatus({ state: 'error', message: String(error), failurePhase: 'download' })
      })
    }
  }

  override applyAutomaticUpdatesSetting(): void {
    if (!this.usesFork) {
      if (this.getAutomaticUpdates?.() === true) {
        super.applyAutomaticUpdatesSetting()
      }
      return
    }
    if (!this.supportsStagedReleases) {
      return
    }
    if (this.getAutomaticUpdates?.() === true) {
      this.runBackgroundUpdateCheck()
    } else if (this.stagedRelease?.automatic && !this.quitAndInstallInProgress) {
      this.cancelStagedRelease()
      this.sendForkOffer(this.offeredInstaller)
    }
  }

  override quitAndInstall(
    trigger: UpdateInstallTrigger = 'manual',
    isCurrentTeamRestart?: () => boolean
  ): void {
    if (!this.usesFork) {
      return super.quitAndInstall(trigger, isCurrentTeamRestart)
    }
    if (trigger !== 'manual' || this.quitAndInstallInProgress) {
      return
    }
    this.restartStagedRelease()
  }

  cancelSOrcaUpdateRestart(): void {
    if (this.usesFork) {
      this.cancelStagedReleaseRestart()
    }
  }

  protected holdForkUpdateForTeam(userInitiated = false): boolean {
    if (!managesUpdates(this.getTeamUpdatePolicy?.())) {
      return false
    }
    this.offeredInstaller = undefined
    this.delayedUpdate = null
    this.cancelStagedRelease()
    this.sendStatus({
      state: 'error',
      retryable: false,
      ...updaterCodedMessage('teamUpdatePolicy'),
      userInitiated
    })
    return true
  }

  protected sendForkOffer(offer: SOrcaReleaseBuild | undefined, userInitiated = false): void {
    this.sendStatus(
      offer
        ? {
            state: 'available',
            version: offer.version,
            releaseUrl: offer.releaseUrl,
            changelog: null
          }
        : { state: 'not-available', userInitiated }
    )
  }

  protected scheduleForkCheck(delay: number): void {
    if (this.supportsStagedReleases && !SORCA_DEVELOPMENT_VERSION.test(app.getVersion())) {
      this.scheduleAutomaticUpdateCheck(delay)
      this.autoUpdateCheckTimer?.unref()
    }
  }

  private checkFork(userInitiated: boolean, options?: UpdateCheckOptions): boolean {
    const tag = options?.targetTag
    if (
      (!userInitiated && SORCA_DEVELOPMENT_VERSION.test(app.getVersion())) ||
      this.checkingFork ||
      this.stagedRelease ||
      this.quitAndInstallInProgress
    ) {
      return false
    }
    if (this.holdForkUpdateForTeam(userInitiated)) {
      return false
    }
    this.checkingFork = true
    this.offeredInstaller = undefined
    this.delayedUpdate = null
    this.sendStatus({ state: 'checking', userInitiated })
    let delay = AUTO_UPDATE_CHECK_INTERVAL_MS
    void listSOrcaReleaseBuilds()
      .then((builds) => {
        if (this.holdForkUpdateForTeam(userInitiated)) {
          return
        }
        const candidate = tag
          ? builds.find((build) => build.tag === tag)
          : builds.find((build) => compareSOrcaBuilds(build.version, app.getVersion()) > 0)
        const available = this.respectUpdateDelay(candidate, options)
        this.recordCompletedUpdateCheck()
        this.offeredInstaller = available
        this.sendForkOffer(available, userInitiated)
        if (
          !userInitiated &&
          available &&
          this.hasStagedReleaseAsset(available) &&
          this.getAutomaticUpdates?.() === true
        ) {
          this.downloadUpdate(true)
        }
      })
      .catch((error: unknown) => {
        delay = AUTO_UPDATE_RETRY_INTERVAL_MS
        if (!this.holdForkUpdateForTeam(userInitiated)) {
          this.sendStatus({ state: 'error', ...updaterErrorMessage(error), userInitiated })
        }
      })
      .finally(() => {
        this.checkingFork = false
        const delayed = this.delayedUpdate
        const wake = delayed && getDelayedUpdateWakeDelayMs(delayed, Date.now())
        this.scheduleForkCheck(wake === null ? delay : Math.min(delay, wake))
      })
    return true
  }

  private respectUpdateDelay(
    candidate: SOrcaReleaseBuild | undefined,
    options: UpdateCheckOptions | undefined
  ): SOrcaReleaseBuild | undefined {
    const delayDays = this.getUpdateDelayDays?.() ?? 0
    if (!candidate || options?.targetTag || options?.ignoreUpdateDelay || delayDays <= 0) {
      return candidate
    }
    const releasedAt = Date.parse(candidate.publishedAt ?? '')
    if (!Number.isFinite(releasedAt)) {
      throw new UpdaterCodedError('sorcaReleaseDateUnavailable')
    }
    if (releasedAt <= Date.now() - updateDelayDaysToMs(delayDays)) {
      return candidate
    }
    this.delayedUpdate = toDelayedUpdate({ ...candidate, releasedAt }, delayDays)
    return undefined
  }
}
