import type { GlobalSettings } from '../../../../shared/settings/global-settings-types'
import { normalizeTaskProviderSettings } from '../../../../shared/work-items/task-providers'

export function prepareLoadedTaskProviderSettings(
  saved: GlobalSettings | undefined,
  markNeedsSave: () => void
): Pick<GlobalSettings, 'defaultTaskSource' | 'visibleTaskProviders'> {
  const settings = normalizeTaskProviderSettings({
    visibleTaskProviders: saved?.visibleTaskProviders,
    defaultTaskSource: saved?.defaultTaskSource
  })
  const defaultedForJira = saved?.visibleTaskProvidersDefaultedForJira === true
  const defaultedForCnb = saved?.visibleTaskProvidersDefaultedForCnb === true
  if (!defaultedForJira && !settings.visibleTaskProviders.includes('jira')) {
    settings.visibleTaskProviders.push('jira')
  }
  if (!defaultedForCnb && !settings.visibleTaskProviders.includes('cnb')) {
    settings.visibleTaskProviders.push('cnb')
  }
  if (!defaultedForJira || !defaultedForCnb) {
    markNeedsSave()
  }
  return settings
}
