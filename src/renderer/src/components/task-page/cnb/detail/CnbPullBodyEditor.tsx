import { useEffect, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/comment-markdown/CommentMarkdown'
import { CnbMarkdownComposer } from '../CnbMarkdownComposer'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbPullDetail, CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

export function CnbPullBodyEditor({
  api,
  row,
  detail,
  onSave,
  onError
}: {
  api: CnbApi
  row: CnbTaskRow
  detail: CnbPullDetail
  onSave: (body: string) => Promise<boolean>
  onError: (message: string | null) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(detail.body)
  const [pending, setPending] = useState(false)
  // Re-seed when the server record refreshes after a save.
  useEffect(() => {
    setBody(detail.body)
  }, [detail.body])

  if (!editing) {
    return (
      <section className="rounded-md border border-border/50 bg-muted/20 p-3">
        {detail.body ? (
          <CommentMarkdown content={detail.body} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('cnb.tasks.noDescription', 'No description.')}
          </p>
        )}
        <div className="mt-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setEditing(true)}>
            {t('cnb.tasks.editBody', 'Edit description')}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-2 rounded-md border border-border/50 bg-background p-3">
      <CnbMarkdownComposer
        api={api}
        target={{ repoId: row.repoId, issueNumber: null }}
        value={body}
        onChange={setBody}
        placeholder={t('cnb.tasks.bodyPlaceholder', 'Description (Markdown)')}
        onPendingChange={setPending}
        onError={onError}
      />
      <div className="flex items-center justify-end gap-2">
        {pending ? (
          <span className="text-[11px] text-muted-foreground">
            {t('cnb.tasks.uploading', 'Uploading…')}
          </span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            setBody(detail.body)
            setEditing(false)
          }}
        >
          {t('cnb.tasks.cancel', 'Cancel')}
        </Button>
        <Button
          size="sm"
          disabled={pending || body === detail.body}
          onClick={async () => {
            const ok = await onSave(body)
            if (ok) {
              setEditing(false)
            }
          }}
        >
          {t('cnb.tasks.saveBody', 'Save description')}
        </Button>
      </div>
    </section>
  )
}
