import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useTranslate } from '@/i18n/use-translate'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { LoaderCircle } from 'lucide-react'
import { CnbMarkdownComposer } from './CnbMarkdownComposer'
import type { PreloadApi } from '../../../../../preload/api-types'
import type { CnbTaskRepository } from '../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

export function CnbCreateIssueDialog({
  api,
  repositories,
  selectedIds,
  onClose,
  onCreated
}: {
  api: CnbApi
  repositories: CnbTaskRepository[]
  selectedIds: ReadonlySet<string>
  onClose: () => void
  onCreated: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const candidates = repositories.filter((repo) => selectedIds.has(repo.id))
  const [repoId, setRepoId] = useState(candidates[0]?.id ?? repositories[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState('')
  const [assignees, setAssignees] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const attachTarget = useMemo(() => (repoId ? { repoId, issueNumber: null } : null), [repoId])

  const submit = async (): Promise<void> => {
    // Uploading attachments must not race an early submit.
    if (!repoId || title.trim().length < 2 || uploading) {
      return
    }
    setBusy(true)
    try {
      const result = await api.writeIssue({
        repoId,
        number: null,
        payload: {
          action: 'create',
          title: title.trim(),
          body: body.trim(),
          labels: labels
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          assignees: assignees
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        }
      })
      if (result.ok) {
        onCreated()
      } else {
        toast.error(
          t('cnb.tasks.writeFailed', 'CNB rejected the change: {{reason}}', {
            reason: result.reason
          })
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('cnb.tasks.createIssue', 'New CNB issue')}</DialogTitle>
          <DialogDescription>
            {t('cnb.tasks.createIssueHint', 'The issue is created on CNB and appears in the list.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Select value={repoId} onValueChange={setRepoId}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder={t('cnb.tasks.repository', 'CNB repository')} />
            </SelectTrigger>
            <SelectContent>
              {(candidates.length > 0 ? candidates : repositories).map((repo) => (
                <SelectItem key={repo.id} value={repo.id}>
                  {repo.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('cnb.tasks.titlePlaceholder', 'Title')}
            className="h-8"
          />
          <CnbMarkdownComposer
            api={api}
            target={attachTarget}
            value={body}
            onChange={setBody}
            placeholder={t('cnb.tasks.bodyPlaceholder', 'Description (Markdown)')}
            disabled={busy}
            onPendingChange={setUploading}
            onError={(message) => toast.error(message)}
          />
          <Input
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
            placeholder={t('cnb.tasks.labelsPlaceholder', 'Labels (comma separated)')}
            className="h-8"
          />
          <Input
            value={assignees}
            onChange={(event) => setAssignees(event.target.value)}
            placeholder={t('cnb.tasks.assigneesPlaceholder', 'Assignees (comma separated)')}
            className="h-8"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('cnb.tasks.cancel', 'Cancel')}
          </Button>
          <Button
            size="sm"
            disabled={busy || uploading || title.trim().length < 2}
            onClick={() => void submit()}
          >
            {busy || uploading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {uploading
              ? t('cnb.tasks.uploading', 'Uploading…')
              : t('cnb.tasks.create', 'Create issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
