import { useEffect, useId, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CnbMarkdownComposer } from '../CnbMarkdownComposer'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type {
  CnbIssueDetail,
  CnbIssueProperty,
  CnbIssueWrite,
  CnbTaskRow
} from '../../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

type SavePayload = Exclude<CnbIssueWrite, { action: 'create' | 'comment' }>

function IssuePropertyField({
  property,
  busy,
  onSave
}: {
  property: CnbIssueProperty
  busy: boolean
  onSave: (payload: Extract<CnbIssueWrite, { action: 'property' }>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const id = useId()
  const [value, setValue] = useState(property.value)
  useEffect(() => setValue(property.value), [property.value])
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {property.name}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          maxLength={50}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          className="h-8"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || value === property.value}
          onClick={() => onSave({ action: 'property', key: property.key, value })}
        >
          {t('cnb.tasks.saveProperty', 'Save')}
        </Button>
      </div>
    </div>
  )
}

export function CnbIssueEditor({
  api,
  repoRow,
  detail,
  busy,
  onSave
}: {
  api: CnbApi
  repoRow: CnbTaskRow
  detail: CnbIssueDetail
  busy: boolean
  onSave: (payload: SavePayload) => void
  onBodySaved?: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [title, setTitle] = useState(detail.title)
  const [body, setBody] = useState(detail.body)
  const [labels, setLabels] = useState(detail.labels.map((label) => label.name).join(', '))
  const [assignees, setAssignees] = useState(detail.assignees.join(', '))
  const [pending, setPending] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Server refresh replaces the record; re-seed edit fields so a save shows persisted values.
  useEffect(() => {
    setTitle(detail.title)
    setBody(detail.body)
    setLabels(detail.labels.map((label) => label.name).join(', '))
    setAssignees(detail.assignees.join(', '))
  }, [detail.title, detail.body, detail.labels, detail.assignees])

  const titleDirty = title.trim().length > 0 && title !== detail.title
  const bodyDirty = body !== detail.body
  const labelsDirty = labels !== detail.labels.map((label) => label.name).join(', ')
  const assigneesDirty = assignees !== detail.assignees.join(', ')

  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-background p-3">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label={t('cnb.tasks.titleField', 'Issue title')}
        className="h-8"
      />
      <div className="flex flex-wrap items-center gap-2">
        {titleDirty ? (
          <Button
            size="sm"
            disabled={busy || pending}
            onClick={() => onSave({ action: 'update', title: title.trim() })}
          >
            {t('cnb.tasks.saveTitle', 'Save title')}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || pending}
          onClick={() =>
            onSave({ action: 'update', state: detail.state === 'open' ? 'closed' : 'open' })
          }
        >
          {detail.state === 'open'
            ? t('cnb.tasks.closeIssue', 'Close issue')
            : t('cnb.tasks.reopenIssue', 'Reopen issue')}
        </Button>
      </div>

      <div className="space-y-1">
        <span className="text-[11px] text-muted-foreground">
          {t('cnb.tasks.bodyField', 'Description')}
        </span>
        <CnbMarkdownComposer
          api={api}
          target={{ repoId: repoRow.repoId, issueNumber: repoRow.number }}
          value={body}
          onChange={setBody}
          placeholder={t('cnb.tasks.bodyPlaceholder', 'Description (Markdown)')}
          disabled={busy}
          onPendingChange={setPending}
          onError={setUploadError}
        />
        {uploadError ? (
          <p role="alert" className="text-xs text-destructive">
            {uploadError}
          </p>
        ) : null}
        {bodyDirty ? (
          <Button
            size="sm"
            disabled={busy || pending}
            onClick={() => onSave({ action: 'update', body })}
          >
            {t('cnb.tasks.saveBody', 'Save description')}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground" htmlFor="cnb-issue-labels">
            {t('cnb.tasks.labels', 'Labels (comma separated)')}
          </label>
          <Textarea
            id="cnb-issue-labels"
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
            className="min-h-9"
          />
          {labelsDirty ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onSave({
                  action: 'labels',
                  labels: labels
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean)
                })
              }
            >
              {t('cnb.tasks.saveLabels', 'Save labels')}
            </Button>
          ) : null}
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground" htmlFor="cnb-issue-assignees">
            {t('cnb.tasks.assignees', 'Assignees (usernames, comma separated)')}
          </label>
          <Textarea
            id="cnb-issue-assignees"
            value={assignees}
            onChange={(event) => setAssignees(event.target.value)}
            className="min-h-9"
          />
          {assigneesDirty ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onSave({
                  action: 'assignees',
                  assignees: assignees
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean)
                })
              }
            >
              {t('cnb.tasks.saveAssignees', 'Save assignees')}
            </Button>
          ) : null}
        </div>
      </div>
      {detail.properties?.length ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">
            {t('cnb.tasks.issueProperties', 'Custom properties')}
          </legend>
          {detail.properties.map((property) => (
            <IssuePropertyField
              key={property.key}
              property={property}
              busy={busy}
              onSave={onSave}
            />
          ))}
        </fieldset>
      ) : null}
    </div>
  )
}
