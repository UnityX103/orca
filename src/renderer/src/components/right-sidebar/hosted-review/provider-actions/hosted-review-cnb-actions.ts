import { presentGitHubPRMergeState } from '@/components/github/github-pr-merge-state'
import type { Translate } from '@/i18n/use-translate'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { hostedReviewRepoOwnerTarget } from '@/store/slices/hosted-review/hosted-review-cache-state'
import type { CnbWriteResult } from '../../../../../../shared/cnb/cnb-tasks'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import type { CnbHostedReviewMutationInput } from '../../../../../../shared/rpc-contract/source-control/hosted-review-params'
import type { HostedReviewActionInfo } from './use-hosted-review-actions'

export async function runCnbHostedReviewAction(
  repo: Repo,
  reviewUrl: string,
  action: CnbHostedReviewMutationInput['action']
): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = hostedReviewRepoOwnerTarget(repo)
  const result =
    target.kind === 'environment'
      ? await callRuntimeRpc<CnbWriteResult>(
          target,
          'hostedReview.mutateCnb',
          { repo: `id:${repo.id}`, reviewUrl, action },
          { timeoutMs: 75_000 }
        )
      : await window.api.cnb?.reviewAction({
          repo: repo.id,
          repoOwnerExecutionHostId: getRepoExecutionHostId(repo),
          reviewUrl,
          action
        })
  return result?.ok
    ? result
    : {
        ok: false,
        error: result?.reason ?? 'CNB pull request actions are unavailable on this host.'
      }
}

export function presentCnbPRMergeState(review: HostedReviewActionInfo, t: Translate) {
  const status = review.mergeStateStatus
  const blocked = Boolean(status && !['mergeable', 'checking', 'merging'].includes(status))
  const conflicts = review.mergeable === 'CONFLICTING'
  const presentation = presentGitHubPRMergeState(
    {
      state: review.state,
      mergeable: review.mergeable,
      mergeStateStatus: blocked && !conflicts ? 'BLOCKED' : undefined,
      reviewDecision: status === 'waiting_review' && !conflicts ? 'REVIEW_REQUIRED' : undefined,
      checksStatus: review.mergeable === 'MERGEABLE' ? review.status : undefined,
      checksSummary: review.mergeable === 'MERGEABLE' ? review.checksSummary : undefined
    },
    t
  )
  let tooltip = t(
    'cnb.review.checkingMerge',
    'CNB is checking whether this pull request can merge.'
  )
  if (conflicts) {
    tooltip = t('cnb.review.mergeConflicts', 'CNB reports merge conflicts.')
  } else if (status === 'waiting_review') {
    tooltip = t('cnb.review.waitingForApproval', 'CNB requires review approval before merging.')
  } else if (status === 'status_check') {
    tooltip = t('cnb.review.waitingForChecks', 'CNB requires status checks to pass before merging.')
  } else if (blocked) {
    tooltip = t('cnb.tasks.mergeBlocked', 'CNB reports this pull request cannot be merged yet.')
  } else if (review.mergeable === 'MERGEABLE' && !review.headSha) {
    tooltip = t(
      'cnb.review.unverifiedHead',
      'Refresh the pull request to verify its source commit.'
    )
  }
  return {
    ...presentation,
    tooltip: review.state === 'draft' ? presentation.tooltip : tooltip,
    autoMergeAction: null,
    directMergeAvailable:
      review.state === 'open' &&
      review.mergeable === 'MERGEABLE' &&
      !blocked &&
      Boolean(review.headSha)
  }
}
