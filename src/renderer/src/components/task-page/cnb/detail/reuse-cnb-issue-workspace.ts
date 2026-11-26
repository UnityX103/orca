import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/workspace/activation/worktree-activation'
import { runtimeTargetForWorkspaceOwner } from '@/lib/workspace/ownership/resolve-owner'
import { getWorkItemRepo } from '@/lib/work-items/work-item-repo-row'
import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { resolveDefaultAgentForWorktree } from '@/lib/agent-session/launch/shortcuts/agent-tab-shortcuts'
import { switchRuntimeGitBranch } from '@/runtime/source-control/git/runtime-git-branch-client'
import { getRuntimeRepoBaseRefDefault } from '@/runtime/source-control/references/runtime-repo-client'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import { getWorkspaceAttachments } from '../../../../../../shared/workspace-attachments/workspace-attachments'
import { matchesWorkspaceAttachmentIdentity } from '../../../../../../shared/workspace-attachments/workspace-attachment-normalization'
import { createNonSecureContextUuid } from '../../../../../../shared/identifiers/non-secure-context-uuid'
import { cnbLinkedWorkItem, cnbRowSourceContext } from '../cnb-work-item'

export async function reuseCnbIssueWorkspace(
  row: CnbTaskRow,
  worktree: Worktree,
  branch: string
): Promise<void> {
  const store = useAppStore.getState()
  const repo = getWorkItemRepo(store.repos, row)
  const hostId = repo && getRepoExecutionHostId(repo)
  const target =
    hostId && runtimeTargetForWorkspaceOwner(store, { workspaceId: worktree.id, hostId })
  if (
    !repo ||
    repo.kind === 'folder' ||
    !hostId ||
    !target ||
    worktree.repoId !== repo.id ||
    (worktree.hostId && worktree.hostId !== hostId)
  ) {
    throw new Error(tWorkspaceUnavailable())
  }
  const base =
    repo.worktreeBaseRef ?? (await getRuntimeRepoBaseRefDefault(hostId, repo.id)).defaultBaseRef
  if (!base) {
    throw new Error(
      translate(
        'cnb.tasks.reuseWorkspaceBaseMissing',
        'Set a project base branch before reusing this workspace.'
      )
    )
  }
  const linkedWorkItem = cnbLinkedWorkItem(row)
  const linkedTaskSourceContext = cnbRowSourceContext(repo)
  const { warning } = await switchRuntimeGitBranch(
    { target, worktreeId: worktree.id, worktreePath: worktree.path },
    { kind: 'new-clean', name: branch, startPoint: base }
  )
  if (warning) {
    throw new Error(warning)
  }

  const previous = worktree.linkedWorkItem
  const links = getWorkspaceAttachments(worktree).filter(
    (link) => previous?.provider !== 'cnb' || !matchesWorkspaceAttachmentIdentity(link, previous)
  )
  const saved = await store.updateWorktreeMeta(
    worktree.id,
    {
      linkedWorkItem,
      linkedTaskSourceContext,
      linkedItems: [
        ...links,
        { ...linkedWorkItem, taskSourceContext: linkedTaskSourceContext ?? undefined }
      ]
    },
    { executionHostId: hostId }
  )
  if (!saved.ok) {
    throw new Error(
      translate(
        'cnb.tasks.reuseWorkspaceLinkFailed',
        'Created {{branch}}, but could not link the issue. {{reason}}',
        {
          branch,
          reason: saved.error
        }
      )
    )
  }
  const agent = await resolveDefaultAgentForWorktree(useAppStore.getState, worktree.id)
  const opened = activateAndRevealWorktree(worktree.id, {
    navigationIntent: 'user-open',
    executionHostId: hostId,
    providesInitialSurface: agent !== null
  })
  if (opened === false) {
    throw new Error(tWorkspaceUnavailable())
  }
  if (agent) {
    launchAgentInNewTabWithOutcome({
      requestId: createNonSecureContextUuid(),
      worktreeId: worktree.id,
      workspaceExecutionHostId: hostId,
      agent,
      prompt: row.url,
      promptDelivery: 'draft'
    })
  }
}

function tWorkspaceUnavailable(): string {
  return translate('cnb.tasks.reuseWorkspaceUnavailable', 'This project workspace is unavailable.')
}
