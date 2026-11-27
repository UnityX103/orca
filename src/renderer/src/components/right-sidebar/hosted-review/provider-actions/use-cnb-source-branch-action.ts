import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirmationDialog } from '@/components/dismiss/confirmation/confirmation-dialog-context'
import { useTranslate } from '@/i18n/use-translate'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import { runCnbHostedReviewAction } from './hosted-review-cnb-actions'
import type { HostedReviewActionInfo } from './use-hosted-review-actions'

export function useCnbSourceBranchAction({
  review,
  repo,
  onRefreshReview,
  setActionError
}: {
  review: HostedReviewActionInfo
  repo: Repo
  onRefreshReview: () => Promise<void>
  setActionError: (message: string | null) => void
}) {
  const t = useTranslate()
  const confirm = useConfirmationDialog()
  const [deletingSourceBranch, setDeletingSourceBranch] = useState(false)
  const handleDeleteSourceBranch = async (): Promise<void> => {
    const { cnbSourceBranch: branch, headSha: expectedHeadSha, url } = review
    if (review.provider !== 'cnb' || !branch || !expectedHeadSha || deletingSourceBranch) {
      return
    }
    setDeletingSourceBranch(true)
    setActionError(null)
    const title = t('cnb.review.deleteSourceBranch', 'Delete Source Branch')
    const confirmed = await confirm({
      title,
      description: t(
        'cnb.review.deleteSourceBranchConfirm',
        'Delete the merged branch {{branch}} on CNB?',
        { branch }
      ),
      confirmLabel: title,
      confirmVariant: 'destructive'
    }).catch(() => false)
    if (confirmed) {
      try {
        const result = await runCnbHostedReviewAction(repo, url, {
          kind: 'delete-source-branch',
          branch,
          expectedHeadSha
        })
        if (result.ok) {
          toast.success(t('cnb.review.sourceBranchDeleted', 'Source branch deleted'))
        } else {
          setActionError(result.error)
        }
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : t('cnb.review.deleteSourceBranchFailed', 'Could not delete the CNB source branch.')
        )
      }
      await onRefreshReview().catch(() => {})
    }
    setDeletingSourceBranch(false)
  }
  return { deletingSourceBranch, handleDeleteSourceBranch }
}
