import { useTranslate } from '@/i18n/use-translate'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ArrowRight, Copy, EllipsisVertical, ExternalLink, FolderPlus } from 'lucide-react'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { toast } from 'sonner'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'

/** Row-end actions menu, mirroring GitHub's PR/issue overflow: workspace, browser, copy link. */
export function CnbRowMenu({
  row,
  attachedWorkspace,
  onStartWorkspace,
  onUseNewWorkspace
}: {
  row: CnbTaskRow
  attachedWorkspace: boolean
  onStartWorkspace: (row: CnbTaskRow) => void
  onUseNewWorkspace: (row: CnbTaskRow) => void
}): React.JSX.Element {
  const t = useTranslate()

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(row.url)
      toast.success(t('cnb.tasks.linkCopied', 'Link copied'))
    } catch {
      toast.error(t('cnb.tasks.copyFailed', 'Could not copy link'))
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={t('cnb.tasks.moreActions', 'More actions for #{{number}}', {
            number: row.number
          })}
        >
          <EllipsisVertical className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem
          onSelect={() => onStartWorkspace(row)}
          aria-label={
            attachedWorkspace
              ? t('cnb.tasks.resumeWorkspace', 'Resume workspace')
              : t('cnb.tasks.startWorkspace', 'Start workspace from #{{number}}', {
                  number: row.number
                })
          }
        >
          <ArrowRight className="size-4" aria-hidden />
          {attachedWorkspace
            ? t('cnb.tasks.resumeWorkspace', 'Resume workspace')
            : t('cnb.tasks.startWorkspaceShort', 'Start workspace')}
        </DropdownMenuItem>
        {attachedWorkspace ? (
          <DropdownMenuItem onSelect={() => onUseNewWorkspace(row)}>
            <FolderPlus className="size-4" aria-hidden />
            {t('cnb.tasks.startNewWorkspace', 'Start new workspace')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openAppHttpLink(row.url)}>
          <ExternalLink className="size-4" aria-hidden />
          {t('cnb.tasks.openInBrowser', 'Open in browser')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyLink()}>
          <Copy className="size-4" aria-hidden />
          {t('cnb.tasks.copyLink', 'Copy link')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
