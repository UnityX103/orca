import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/slices/worktrees/listing/use-worktree-catalog'
import { activateAndRevealWorktree } from '@/lib/workspace/activation/worktree-activation'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import type { PreloadApi } from '../../../../../../preload/api-types'
import { cnbRowWorkItemType } from '../cnb-work-item'
import { useCnbTaskDispatch } from './use-cnb-task-dispatch'
import { useCnbDispatchPlacement } from './use-cnb-dispatch-placement'
import { useCnbDispatchChatAvailability } from './cnb-bobot-chat-availability'
import { CnbTaskDispatchPanel } from './CnbTaskDispatchPanel'
import { hasCnbTaskDispatchApi } from './cnb-dispatch-api-support'

type CnbApi = NonNullable<PreloadApi['cnb']>

export function CnbTaskDispatchSection({
  api,
  row,
  onCreateWorkspace
}: {
  api: CnbApi
  row: CnbTaskRow
  /** Opens the record's workspace creation; the owner dispatches here once it exists. */
  onCreateWorkspace: (row: CnbTaskRow) => void
}): React.JSX.Element {
  const type = cnbRowWorkItemType(row)
  const { repoId, number } = row
  const target = useMemo(() => ({ repoId, type, number }), [repoId, type, number])
  const placement = useCnbDispatchPlacement(target, row.url)
  const worktrees = useAllWorktrees()
  const dispatch = useCnbTaskDispatch({ api, target })
  // A record's own dispatch names the workspace it runs in; that identity outranks a link search.
  const recordWorktreeId = dispatch.dispatch?.worktreeId
  const worktree = recordWorktreeId
    ? (worktrees.find((candidate) => candidate.id === recordWorktreeId) ?? null)
    : placement.worktree
  const hostId = useAppStore((s) =>
    worktree ? getExecutionHostIdForWorktree(s, worktree.id) : null
  )
  const availability = useCnbDispatchChatAvailability({
    apiSupported: hasCnbTaskDispatchApi(api),
    worktreeId: worktree?.id ?? null,
    hostId
  })

  return (
    <CnbTaskDispatchPanel
      target={target}
      rowTitle={row.title}
      repoSlug={row.repoSlug}
      worktree={worktree}
      state={{ ...dispatch, availability }}
      spec={placement.spec}
      onSpecChange={placement.setSpec}
      onCreateWorkspace={() => onCreateWorkspace(row)}
      onOpenWorkspace={(worktree) => {
        activateAndRevealWorktree(worktree.id, { navigationIntent: 'user-open' })
      }}
    />
  )
}
