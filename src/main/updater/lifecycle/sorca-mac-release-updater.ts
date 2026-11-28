import { app } from 'electron'
import type { SOrcaReleaseBuild } from '../releases/sorca-release-feed'
import type { UpdateStatus } from '../../../shared/updater/update-status-types'
import { updaterCodedMessage } from '../../../shared/updater/updater-failure-copy'
import { managesUpdates } from '../releases/updater-release-policy'
import { AUTO_UPDATE_RETRY_INTERVAL_MS } from './updater-state'
import { updaterErrorMessage } from './updater-coded-error'
import { UpdaterSetup } from './updater-setup'
import {
  discardSOrcaPublishedUpdate,
  getSOrcaLocalUpdateStatus,
  hasStagedSOrcaPublishedUpdate,
  setSOrcaPublishedUpdateRestart,
  stageSOrcaPublishedUpdate,
  type PublishedUpdateInstallPolicy
} from '../local-package/sorca-local-update'
import { describeMacUpdateBlockers } from '../mac-install/mac-browser-sidecar-recovery'
import { getMacUpdateRunningInstances } from '../mac-install/macos-update-running-instances'

type MacReleaseUpdate = {
  offer: SOrcaReleaseBuild
  automatic: boolean
  canInstall: PublishedUpdateInstallPolicy
}

export abstract class SOrcaMacReleaseUpdater extends UpdaterSetup {
  protected macUpdate: MacReleaseUpdate | undefined

  protected abstract holdForkUpdateForTeam(userInitiated?: boolean): boolean
  protected abstract sendForkOffer(
    offer: SOrcaReleaseBuild | undefined,
    userInitiated?: boolean
  ): void
  protected abstract scheduleForkCheck(delay: number): void

  protected get supportsMacUpdates(): boolean {
    return (
      process.platform === 'darwin' &&
      process.arch === 'arm64' &&
      this.updateInstallMode === 'interactive'
    )
  }

  protected restartMacUpdate(): void {
    const update = this.macUpdate
    if (
      this.holdForkUpdateForTeam(true) ||
      !update ||
      !hasStagedSOrcaPublishedUpdate(update.canInstall)
    ) {
      this.sendToMainWindow('updater:quitAndInstallAborted')
      return
    }
    this.quitAndInstallInProgress = true
    void this.restartIntoMacUpdate(update)
  }

  protected cancelMacUpdateRestart(): void {
    if (!this.quittingForUpdate) {
      return
    }
    this.quittingForUpdate = false
    this.quitAndInstallInProgress = false
    const update = this.macUpdate
    if (update && setSOrcaPublishedUpdateRestart(update.canInstall, false)) {
      if (update.canInstall(false)) {
        this.sendMacUpdateReady(update)
      } else {
        this.applyAutomaticUpdatesSetting()
      }
    }
    this.sendToMainWindow('updater:quitAndInstallAborted')
  }

  private async restartIntoMacUpdate(update: MacReleaseUpdate): Promise<void> {
    const { offer, canInstall } = update
    this.sendMacUpdateReady(update, true)
    try {
      const executable = app.getPath('exe')
      const blockers = await getMacUpdateRunningInstances(executable)
      if (blockers.length > 0) {
        const instances = await describeMacUpdateBlockers(executable, blockers)
        if (this.macUpdate === update) {
          this.sendInstallFailureStatus({
            state: 'error',
            version: offer.version,
            retryAction: 'install',
            installBlock: { reason: 'running-instances', instances },
            ...updaterCodedMessage('sorcaMacRunningInstances')
          })
        }
        return
      }
      await this.runBeforeUpdateQuitCleanup()
      if (
        this.macUpdate !== update ||
        this.holdForkUpdateForTeam(true) ||
        !setSOrcaPublishedUpdateRestart(canInstall, true)
      ) {
        return
      }
      this.quittingForUpdate = true
      app.quit()
    } catch (error) {
      this.quittingForUpdate = false
      setSOrcaPublishedUpdateRestart(canInstall, false)
      if (this.macUpdate === update) {
        console.warn('[sorca-update] Restart preflight failed', error)
        this.sendInstallFailureStatus({
          state: 'error',
          version: offer.version,
          retryAction: 'install',
          ...updaterCodedMessage('sorcaMacRestartFailed')
        })
      }
    } finally {
      if (this.quitAndInstallInProgress && !this.quittingForUpdate) {
        this.quitAndInstallInProgress = false
        this.sendToMainWindow('updater:quitAndInstallAborted')
        if (this.macUpdate?.automatic && this.getAutomaticUpdates?.() !== true) {
          this.applyAutomaticUpdatesSetting()
        }
      }
    }
  }

  protected cancelMacUpdate(): void {
    const update = this.macUpdate
    if (update) {
      this.macUpdate = undefined
      void discardSOrcaPublishedUpdate(update.canInstall).catch(console.warn)
    }
  }

  private sendMacUpdateReady({ offer, automatic }: MacReleaseUpdate, installing = false): void {
    this.sendStatus({
      state: 'downloaded',
      version: offer.version,
      releaseUrl: offer.releaseUrl,
      automaticDownload: automatic,
      installOnQuit: true,
      ...(installing ? { installing: true } : {})
    })
  }

  protected async downloadMacRelease(offer: SOrcaReleaseBuild, automatic: boolean): Promise<void> {
    const canInstall = (restartRequested: boolean): boolean =>
      !managesUpdates(this.getTeamUpdatePolicy?.()) &&
      (restartRequested || !automatic || this.getAutomaticUpdates?.() === true)
    const update = { offer, automatic, canInstall }
    const downloadStatus: Extract<UpdateStatus, { state: 'downloading' }> = {
      state: 'downloading',
      percent: 0,
      version: offer.version,
      automaticDownload: automatic
    }
    try {
      const preparation = stageSOrcaPublishedUpdate(
        offer,
        (percent) => {
          if (this.macUpdate === update) {
            this.sendStatus({ ...downloadStatus, percent })
          }
        },
        canInstall
      )
      if (!preparation) {
        if (!automatic && getSOrcaLocalUpdateStatus()?.pendingVersion) {
          this.sendStatus({
            state: 'error',
            version: offer.version,
            failurePhase: 'download',
            retryable: true,
            ...updaterCodedMessage('sorcaLocalUpdatePending')
          })
        }
        return
      }
      this.macUpdate = update
      this.sendStatus(downloadStatus)
      const result = await preparation
      if (this.macUpdate !== update) {
        return
      }
      if (result.kind === 'staged' && canInstall(false)) {
        this.sendMacUpdateReady(update)
        return
      }
      this.cancelMacUpdate()
      if (this.holdForkUpdateForTeam()) {
        return
      }
      if (result.kind === 'error') {
        const reason =
          result.reason === 'signing-identity'
            ? 'sorcaMacSigningIdentity'
            : result.reason === 'system-version'
              ? 'sorcaMacSystemVersion'
              : 'sorcaMacStagingFailed'
        this.sendStatus({
          state: 'error',
          version: offer.version,
          failurePhase: 'download',
          retryable: result.reason === 'prepare-failed',
          ...updaterCodedMessage(reason)
        })
        if (automatic && result.reason === 'prepare-failed') {
          this.scheduleForkCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)
        }
      } else {
        this.sendForkOffer(offer)
      }
    } catch (error) {
      if (this.macUpdate === update) {
        this.cancelMacUpdate()
        this.sendStatus({
          state: 'error',
          version: offer.version,
          failurePhase: 'download',
          ...updaterErrorMessage(error)
        })
      }
    }
  }
}
