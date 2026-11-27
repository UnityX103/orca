import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, LoaderCircle, Tag } from 'lucide-react'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'
import type { CnbRowWriteRunner } from './use-cnb-row-writes'

type CnbApi = NonNullable<PreloadApi['cnb']>

const MAX_VISIBLE = 3

/** Repo label vocabulary for the editor; falls back to the row's own labels if the read fails. */
function useRepoLabelNames(api: CnbApi | undefined, row: CnbTaskRow, enabled: boolean): string[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    if (!api || !enabled) {
      return
    }
    let active = true
    void api.labels({ repoIds: [row.repoId] }).then(
      (result) => {
        if (active) {
          setNames(result)
        }
      },
      () => {
        if (active) {
          setNames([])
        }
      }
    )
    return () => {
      active = false
    }
  }, [api, enabled, row.repoId])
  return names
}

/**
 * Inline label editor. CNB replaces the whole label set on PUT, so the editor always seeds from
 * the row's full label list and sends it back — the 3 chips shown in the row are presentation only,
 * never the write payload.
 */
export function CnbLabelsCell({
  api,
  row,
  kind,
  writer
}: {
  api: CnbApi | undefined
  row: CnbTaskRow
  kind: 'issues' | 'pull-requests'
  writer: CnbRowWriteRunner
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState('')
  const vocabulary = useRepoLabelNames(api, row, open)
  const selected = row.labels.map((label) => label.name)

  const options = useMemo(() => {
    const names = new Set(vocabulary)
    // Preserve every current label, including ones outside the repo vocabulary (e.g. legacy names).
    for (const label of row.labels) {
      names.add(label.name)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [row.labels, vocabulary])

  const commit = (next: string[]): void => {
    const failure = t('cnb.tasks.labelsUpdateFailed', 'Failed to update labels.')
    const payload = { action: 'labels' as const, labels: next }
    if (kind === 'issues') {
      void writer.runIssue(row, payload, failure)
    } else {
      void writer.runPull(row, payload, failure)
    }
  }

  const toggle = (name: string): void => {
    commit(
      selected.includes(name) ? selected.filter((entry) => entry !== name) : [...selected, name]
    )
  }

  const addManual = (): void => {
    const name = manual.trim()
    if (name && !selected.includes(name)) {
      commit([...selected, name])
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {row.labels.slice(0, MAX_VISIBLE).map((label) => (
          <span
            key={label.name}
            className="max-w-[96px] truncate rounded-full border border-border/40 bg-muted/30 px-1.5 text-[10px] text-muted-foreground"
          >
            {label.name}
          </span>
        ))}
        {row.labels.length > MAX_VISIBLE ? (
          <span className="text-[10px] text-muted-foreground">
            +{row.labels.length - MAX_VISIBLE}
          </span>
        ) : null}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={writer.pending}
            data-cnb-labels-trigger
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={t('cnb.tasks.editLabels', 'Edit labels')}
            className={cn(
              'inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-accent hover:text-foreground'
            )}
          >
            {writer.pending ? (
              <LoaderCircle className="size-3 animate-spin" aria-hidden />
            ) : (
              <Tag className="size-3" aria-hidden />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          tone="menu"
          className="w-60"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="popover-scroll-content scrollbar-sleek -mx-1 px-1">
            {options.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                {t('cnb.tasks.noLabelsAvailable', 'No labels on the selected projects.')}
              </div>
            ) : (
              options.map((name) => {
                const isOn = selected.includes(name)
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={writer.pending}
                    aria-pressed={isOn}
                    onClick={() => toggle(name)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted/50 disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                        isOn ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                      )}
                      aria-hidden
                    >
                      {isOn ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                  </button>
                )
              })
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 border-t border-border/50 pt-1">
            <Input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addManual()
                }
              }}
              placeholder={t('cnb.tasks.labelNamePlaceholder', 'Label name')}
              aria-label={t('cnb.tasks.labelNamePlaceholder', 'Label name')}
              density="compact"
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={writer.pending || !manual.trim()}
              aria-label={t('cnb.tasks.addLabel', 'Add label')}
              onClick={addManual}
            >
              <Tag className="size-3.5" aria-hidden />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
