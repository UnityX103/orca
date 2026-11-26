import { useCallback } from 'react'
import type { PreloadApi } from '../../../../../preload/api-types'
import { useAppStore } from '@/store/index'
import { INTEGRATION_SETTING_TARGET_IDS } from '@/components/settings/integrations/integrations-search'
import { getWorkItemRepo } from '@/lib/work-items/work-item-repo-row'
import { findCnbWorkItemWorkspaceAttachment } from '@/lib/work-items/cnb/cnb-work-item-workspace-attachment'
import { activateAndRevealWorktree } from '@/lib/workspace/activation/worktree-activation'
import {
  cnbLinkedWorkItem,
  cnbRowWorkItemType,
  cnbWorkspaceSeed,
  cnbRowSourceContext
} from './cnb-work-item'
import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import type { CnbTaskRow } from '../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

/**
 * Start or resume a workspace from a CNB row. A PR starts from its head branch (fetched on demand
 * because the list row carries no head ref); an issue starts from the repo's base ref.
 */
export function useCnbOpenWorkItem(
  model: TaskPageComposerActionsModel,
  api: CnbApi | undefined
): (row: CnbTaskRow) => void {
  return useCallback(
    (row: CnbTaskRow) => {
      const type = cnbRowWorkItemType(row)
      const attached = findCnbWorkItemWorkspaceAttachment(
        model.allWorktrees,
        row.repoId,
        type,
        row.number,
        row.url
      )
      if (attached) {
        if (activateAndRevealWorktree(attached.id, { navigationIntent: 'user-open' }) !== false) {
          return
        }
      }
      const repo = getWorkItemRepo(model.repos, row)
      const openComposer = (baseBranch?: string): void => {
        model.openModal('new-workspace-composer', {
          linkedWorkItem: cnbLinkedWorkItem(row),
          taskSourceContext: cnbRowSourceContext(repo),
          prefilledName: cnbWorkspaceSeed(row),
          initialRepoId: row.repoId,
          ...(baseBranch ? { initialBaseBranch: baseBranch } : {}),
          telemetrySource: 'sidebar'
        })
      }
      if (type !== 'pr' || !api) {
        openComposer()
        return
      }
      void api.pullDetail({ repoId: row.repoId, number: row.number }).then(
        (result) =>
          openComposer(result.ok && result.detail.headRef ? result.detail.headRef : undefined),
        () => openComposer()
      )
    },
    [api, model]
  )
}

export function useCnbOpenIntegrations(): () => void {
  return useCallback(() => {
    const { openSettingsPage, openSettingsTarget } = useAppStore.getState()
    openSettingsPage()
    openSettingsTarget({
      pane: 'integrations',
      repoId: null,
      sectionId: INTEGRATION_SETTING_TARGET_IDS.cnb
    })
  }, [])
}
