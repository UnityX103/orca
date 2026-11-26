import { useEffect, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { CnbPullDetail } from '../../../../../../shared/cnb/cnb-tasks'

type MergeStyle = 'merge' | 'squash' | 'rebase'

function normalizeMergeStyle(value: string): MergeStyle {
  return value === 'squash' || value === 'rebase' ? value : 'merge'
}

export function CnbPullActions({
  detail,
  busy,
  onReview,
  onMerge,
  onReviewers
}: {
  detail: CnbPullDetail
  busy: boolean
  onReview: (event: 'approve' | 'comment' | 'request_changes', body: string) => Promise<boolean>
  onMerge: (style: 'merge' | 'squash' | 'rebase', title: string, message: string) => void
  onReviewers: (reviewers: string[]) => void
}): React.JSX.Element {
  const t = useTranslate()
  const savedReviewers = detail.reviewers.map((reviewer) => reviewer.login).join(', ')
  const [reviewers, setReviewers] = useState(savedReviewers)
  useEffect(() => setReviewers(savedReviewers), [savedReviewers])
  const changes = [
    ...new Set(
      reviewers
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ]
  const [reviewBody, setReviewBody] = useState('')
  const submitReview = async (event: Parameters<typeof onReview>[0]): Promise<void> => {
    if (await onReview(event, reviewBody.trim())) {
      setReviewBody('')
    }
  }
  const [style, setStyle] = useState<'merge' | 'squash' | 'rebase'>('merge')
  const canMerge = detail.state === 'open' && detail.mergeable === 'MERGEABLE'

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border/50 bg-background p-3">
      <Textarea
        value={reviewBody}
        onChange={(event) => setReviewBody(event.target.value)}
        disabled={busy}
        placeholder={t('cnb.tasks.reviewBody', 'Write a review…')}
        aria-label={t('cnb.tasks.reviewBody', 'Write a review…')}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void submitReview('approve')}
        >
          {t('cnb.tasks.approve', 'Approve')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void submitReview('request_changes')}
        >
          {t('cnb.tasks.requestChanges', 'Request changes')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !reviewBody.trim()}
          onClick={() => void submitReview('comment')}
        >
          {t('cnb.tasks.reviewComment', 'Review comment')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={reviewers}
          onChange={(event) => setReviewers(event.target.value)}
          placeholder={t('cnb.tasks.reviewersPlaceholder', 'Reviewer usernames')}
          aria-label={t('cnb.tasks.reviewersPlaceholder', 'Reviewer usernames')}
          className="h-8 max-w-64"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || changes.join(', ') === savedReviewers}
          onClick={() => onReviewers(changes)}
        >
          {t('cnb.tasks.saveReviewers', 'Save reviewers')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={style} onValueChange={(value) => setStyle(normalizeMergeStyle(value))}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="merge">{t('cnb.tasks.mergeCommit', 'Merge commit')}</SelectItem>
            <SelectItem value="squash">{t('cnb.tasks.squash', 'Squash')}</SelectItem>
            <SelectItem value="rebase">{t('cnb.tasks.rebase', 'Rebase')}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={busy || !canMerge}
          title={
            canMerge
              ? undefined
              : t('cnb.tasks.mergeBlocked', 'CNB reports this pull request cannot be merged yet.')
          }
          onClick={() => onMerge(style, detail.title, '')}
        >
          {t('cnb.tasks.merge', 'Merge')}
        </Button>
      </div>
    </div>
  )
}
