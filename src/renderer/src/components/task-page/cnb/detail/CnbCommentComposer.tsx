import { useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { CnbMarkdownComposer } from '../CnbMarkdownComposer'
import type { PreloadApi } from '../../../../../../preload/api-types'

type CnbApi = NonNullable<PreloadApi['cnb']>

export function CnbCommentComposer({
  api,
  target,
  busy,
  onSubmit
}: {
  api: CnbApi | undefined
  target: { repoId: string; issueNumber: number | null } | null
  busy: boolean
  onSubmit: (body: string) => Promise<boolean>
}): React.JSX.Element {
  const t = useTranslate()
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (): Promise<void> => {
    const trimmed = body.trim()
    if (!trimmed || pending) {
      return
    }
    setError(null)
    // Only clear the draft on success so a rejected write keeps what the user typed.
    const ok = await onSubmit(trimmed)
    if (ok) {
      setBody('')
    }
  }
  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-background p-2">
      <CnbMarkdownComposer
        api={api}
        target={target}
        value={body}
        onChange={setBody}
        placeholder={t('cnb.tasks.commentPlaceholder', 'Write a comment…')}
        disabled={busy}
        onPendingChange={setPending}
        onError={setError}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {pending ? (
          <span className="text-[11px] text-muted-foreground">
            {t('cnb.tasks.uploading', 'Uploading…')}
          </span>
        ) : null}
        <Button size="sm" disabled={busy || pending || !body.trim()} onClick={() => void submit()}>
          {t('cnb.tasks.commentSubmit', 'Comment')}
        </Button>
      </div>
    </div>
  )
}
