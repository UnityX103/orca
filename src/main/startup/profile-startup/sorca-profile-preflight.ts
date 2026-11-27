import { app, dialog } from 'electron'
import { isSOrcaVersion } from '../../../shared/app-lifecycle/identity/sorca-build-version'
import { prepareEarlyMainUiLanguage, translateMain } from '../../i18n/main-i18n'
import {
  rememberSOrcaProfileLocation,
  resolveSOrcaProfileLocation,
  type SOrcaProfileLocation
} from './sorca-profile-location'

async function chooseSOrcaProfile(
  appData: string,
  profiles: SOrcaProfileLocation[],
  missingPath?: string
): Promise<void> {
  await app.whenReady()
  await prepareEarlyMainUiLanguage()
  const cancel = profiles.length
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: translateMain('sorca.profile.title', 'Choose existing Orca data'),
    message: missingPath
      ? translateMain(
          'sorca.profile.missing',
          'Orca could not find the previously selected data directory.'
        )
      : translateMain(
          'sorca.profile.multiple',
          'Orca found two existing data directories. Choose the one you used before updating.'
        ),
    detail: [missingPath, ...profiles.map(({ path }) => path)].filter(Boolean).join('\n'),
    buttons: [
      ...profiles.map(({ name }) =>
        name === 'SOrca'
          ? translateMain('sorca.profile.legacy', 'Use legacy data')
          : translateMain('sorca.profile.shared', 'Use shared Orca data')
      ),
      translateMain('sorca.profile.quit', 'Quit')
    ],
    cancelId: cancel,
    defaultId: cancel
  })
  const chosen = profiles[response]
  if (chosen) {
    await rememberSOrcaProfileLocation(appData, chosen.name)
    app.relaunch()
  }
}

export function configureSOrcaProfile(): Promise<boolean> | null {
  if (
    !app.isPackaged ||
    app.getName() !== 'orca' ||
    !isSOrcaVersion(app.getVersion()) ||
    process.env.ORCA_E2E_USER_DATA_DIR ||
    app.commandLine.hasSwitch('user-data-dir')
  ) {
    return null
  }
  return applySOrcaProfile(app.getPath('appData'))
}

async function applySOrcaProfile(appData: string): Promise<boolean> {
  const selection = await resolveSOrcaProfileLocation(appData)
  if (app.isReady()) {
    throw new Error('SOrca profile selection must finish before Electron is ready.')
  }
  if (selection.kind === 'choose') {
    if (process.argv.includes('--serve')) {
      throw new Error('Launch Orca on the desktop to select its existing data directory.')
    }
    void chooseSOrcaProfile(appData, selection.profiles, selection.missingPath)
      .catch((error: unknown) =>
        console.error('[sorca] Could not select the profile directory:', error)
      )
      .finally(() => app.exit())
    return false
  }

  const { name, path } = selection.profile
  // Restore the legacy Keychain service before Electron fixes it at startup.
  if (name === 'SOrca' && process.platform === 'darwin') {
    app.setName(name)
    app.once('ready', () => app.setName('orca'))
  }
  app.setPath('userData', path)
  app.setPath('sessionData', path)
  if (selection.remember && !process.argv.includes('--serve')) {
    void app
      .whenReady()
      .then(() => rememberSOrcaProfileLocation(appData, name))
      .catch((error: unknown) =>
        console.warn('[sorca] Could not remember the profile directory:', error)
      )
  }
  return true
}
