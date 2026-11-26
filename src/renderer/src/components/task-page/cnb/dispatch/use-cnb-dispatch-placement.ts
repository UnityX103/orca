// The record's workspace for a dispatch: reused when one already carries it, else the owner creates
// one through the existing flow. The typed instructions are kept as a draft either way, and the owner
// dispatches from the panel once the workspace is there — nothing starts on its own.
import { useCallback, useMemo, useState } from 'react'
import { useAllWorktrees } from '@/store/slices/worktrees/listing/use-worktree-catalog'
import { findCnbWorkItemWorkspaceAttachment } from '@/lib/work-items/cnb/cnb-work-item-workspace-attachment'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { CnbTaskDispatchTarget } from '../../../../../../shared/cnb/cnb-task-dispatch'
import { readCnbDispatchDraft, saveCnbDispatchDraft } from './cnb-dispatch-draft'

export type CnbDispatchPlacement = {
  /** The record's workspace, when one already carries it: the dispatch reuses it. */
  worktree: Worktree | null
  /** The instructions the owner typed, restored after the detail or the app reopens. */
  spec: string
  setSpec: (next: string) => void
}

export function useCnbDispatchPlacement(
  target: CnbTaskDispatchTarget,
  /** The record's CNB URL: legacy folder links carry only it, so it disambiguates a same-number item. */
  sourceUrl?: string
): CnbDispatchPlacement {
  const worktrees = useAllWorktrees()
  const [spec, setSpecState] = useState(() => readCnbDispatchDraft(target))

  const worktree = useMemo(
    () =>
      findCnbWorkItemWorkspaceAttachment(
        worktrees,
        target.repoId,
        target.type,
        target.number,
        sourceUrl
      ),
    [worktrees, target.repoId, target.type, target.number, sourceUrl]
  )

  const setSpec = useCallback(
    (next: string) => {
      setSpecState(next)
      saveCnbDispatchDraft(target, next)
    },
    [target]
  )

  return { worktree, spec, setSpec }
}
