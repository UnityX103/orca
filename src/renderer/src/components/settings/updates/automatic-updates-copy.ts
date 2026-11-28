import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'

export function getAutomaticUpdatesSettingCopy(t: Translate = translate, installOnQuit = false) {
  return {
    title: t('settings.automaticUpdates.title', 'Automatic updates'),
    description: installOnQuit
      ? t(
          'settings.automaticUpdates.installOnQuitDescription',
          'Orca downloads eligible updates in the background and installs them the next time you quit.'
        )
      : t(
          'settings.automaticUpdates.description',
          'On supported desktop installs, Orca downloads eligible updates on its regular check schedule and restarts to install them automatically.'
        )
  }
}
