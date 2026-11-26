import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/slices/worktrees/listing/use-worktree-catalog'
import { getWorkItemRepo } from '@/lib/work-items/work-item-repo-row'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import { isBranchNameValid } from '../../../../../../shared/git/branch-switch-target'
import { createNonSecureContextUuid } from '../../../../../../shared/identifiers/non-secure-context-uuid'
import { reuseCnbIssueWorkspace } from './reuse-cnb-issue-workspace'

export function CnbReuseWorkspaceAction({ row }: { row: CnbTaskRow }): React.JSX.Element | null {
  const t = useTranslate()
  const repo = useAppStore((state) => getWorkItemRepo(state.repos, row))
  const worktrees = useAllWorktrees()
  const [open, setOpen] = useState(false)
  if (!repo || repo.kind === 'folder') {
    return null
  }
  const hostId = getRepoExecutionHostId(repo)
  const candidates = worktrees.filter(
    (worktree) =>
      worktree.repoId === repo.id &&
      (worktree.hostId ?? hostId) === hostId &&
      !worktree.isArchived &&
      !worktree.isBare
  )
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t('cnb.tasks.reuseWorkspace', 'Reuse workspace')}
      </Button>
      {open ? (
        <CnbReuseWorkspaceDialog row={row} candidates={candidates} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

function CnbReuseWorkspaceDialog({
  row,
  candidates,
  onClose
}: {
  row: CnbTaskRow
  candidates: Worktree[]
  onClose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [worktreeId, setWorktreeId] = useState('')
  const [branch, setBranch] = useState(
    () => `cnb-issue-${row.number}-${createNonSecureContextUuid().slice(0, 8)}`
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = candidates.find((worktree) => worktree.id === worktreeId)
  const validBranch = isBranchNameValid(branch.trim())
  const submit = () => {
    if (!selected || !validBranch || busy) {
      return
    }
    setBusy(true)
    setError(null)
    void reuseCnbIssueWorkspace(row, selected, branch.trim())
      .then(onClose)
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => setBusy(false))
  }
  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cnb.tasks.reuseWorkspace', 'Reuse workspace')}</DialogTitle>
          <DialogDescription>
            {t(
              'cnb.tasks.reuseWorkspaceHint',
              'Orca checks for pending changes and creates a new branch from the project base before opening the task.'
            )}
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('cnb.tasks.reuseWorkspaceEmpty', 'This project has no existing Git workspace.')}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cnb-reuse-workspace">
                {t('cnb.tasks.reuseWorkspaceTarget', 'Workspace')}
              </Label>
              <Select value={worktreeId} onValueChange={setWorktreeId} disabled={busy}>
                <SelectTrigger id="cnb-reuse-workspace" className="w-full">
                  <SelectValue
                    placeholder={t('cnb.tasks.reuseWorkspacePick', 'Choose a workspace')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((worktree) => (
                    <SelectItem key={worktree.id} value={worktree.id}>
                      {worktree.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected ? (
                <p className="break-all font-mono text-xs text-muted-foreground">{selected.path}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnb-reuse-branch">
                {t('cnb.tasks.reuseWorkspaceBranch', 'New branch')}
              </Label>
              <Input
                id="cnb-reuse-branch"
                variant="code"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('cnb.tasks.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={!selected || !validBranch || busy}>
            {busy
              ? t('cnb.tasks.reuseWorkspacePending', 'Preparing workspace…')
              : t('cnb.tasks.reuseWorkspace', 'Reuse workspace')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
