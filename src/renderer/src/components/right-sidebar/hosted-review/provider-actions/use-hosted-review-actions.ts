import { gitLabApiFor } from '@/runtime/repository-gitlab/gitlab-owner-api'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useConfirmationDialog } from '@/components/dismiss/confirmation/confirmation-dialog-context'
import type { GitHubPRAutoMergeAction } from '@/components/github/github-pr-merge-state'
import type { HostedReviewInfo } from '../../../../../../shared/source-control/hosted-review/hosted-review-contracts'
import type {
  GitHubPRMergeMethod,
  PRInfo
} from '../../../../../../shared/github/pull-requests/pull-request-types'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import {
  mergeGitHubHostedReview,
  setGitHubHostedReviewAutoMerge,
  updateGitHubHostedReviewState
} from './hosted-review-github-actions'
import { translate } from '@/i18n/i18n'
import { getHostedReviewStateChangeCopy } from './hosted-review-state-change-copy'
import { buildGitHubPRStackMergeConfirmation } from './github-pr-stack-confirmation'
import { useReadyHostedReviewAction } from './use-ready-hosted-review-action'
import { codeHostErrorText } from '@/lib/source-control/remote/code-host-error-copy'
import { runCnbHostedReviewAction } from './hosted-review-cnb-actions'
import { useCnbSourceBranchAction } from './use-cnb-source-branch-action'

export type HostedReviewActionInfo = Pick<
  HostedReviewInfo,
  'provider' | 'number' | 'url' | 'state' | 'status' | 'mergeable' | 'headSha' | 'cnbSourceBranch'
> &
  Partial<
    Pick<
      HostedReviewInfo,
      | 'checksSummary'
      | 'reviewDecision'
      | 'autoMergeEnabled'
      | 'autoMergeAllowed'
      | 'mergeQueueRequired'
      | 'mergeStateStatus'
    >
  >

export function useHostedReviewActions({
  review,
  githubPR,
  repo,
  isGitLab,
  shortLabel,
  reviewLabel,
  defaultMergeMethod,
  autoMergeAction,
  onRefreshReview
}: {
  review: HostedReviewActionInfo
  githubPR?: PRInfo | null
  repo: Repo
  isGitLab: boolean
  shortLabel: string
  reviewLabel: string
  defaultMergeMethod: GitHubPRMergeMethod
  autoMergeAction: GitHubPRAutoMergeAction | null
  onRefreshReview: () => Promise<void>
}) {
  const confirm = useConfirmationDialog()
  const [merging, setMerging] = useState(false)
  const [stateUpdating, setStateUpdating] = useState<'open' | 'closed' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const isCnb = review.provider === 'cnb'
  const sourceBranchAction = useCnbSourceBranchAction({
    review,
    repo,
    onRefreshReview,
    setActionError
  })
  const { readying, handleMarkReadyForReview } = useReadyHostedReviewAction({
    reviewNumber: review.number,
    githubPR,
    repo,
    isGitLab,
    shortLabel,
    reviewLabel,
    onRefreshReview,
    setActionError
  })

  const handleMerge = useCallback(
    async (method: GitHubPRMergeMethod = defaultMergeMethod) => {
      const expectedHeadSha = review.headSha
      if (isCnb && !expectedHeadSha) {
        return
      }
      if (!isGitLab && !isCnb && githubPR?.stack) {
        const usesMergeQueue =
          review.mergeQueueRequired === true || githubPR.mergeQueueRequired === true
        const confirmed = await confirm(
          buildGitHubPRStackMergeConfirmation({
            stack: githubPR.stack,
            currentPRNumber: review.number,
            method,
            usesMergeQueue
          })
        )
        if (!confirmed) {
          return
        }
      }
      setMerging(true)
      setActionError(null)
      try {
        const result =
          isCnb && expectedHeadSha
            ? await runCnbHostedReviewAction(repo, review.url, {
                kind: 'merge',
                method,
                expectedHeadSha
              })
            : isGitLab
              ? await gitLabApiFor({
                  repoPath: repo.path,
                  repoOwnerExecutionHostId: getRepoExecutionHostId(repo)
                }).mergeMR({
                  repoPath: repo.path,
                  repoId: repo.id,
                  iid: review.number,
                  method
                })
              : await mergeGitHubHostedReview({
                  repo,
                  prNumber: review.number,
                  method,
                  prRepo: githubPR?.prRepo ?? null,
                  expectedHeadSha: githubPR?.headSha ?? null
                })
        if (!result.ok) {
          setActionError(codeHostErrorText(result))
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Merge failed')
      } finally {
        await onRefreshReview().catch(() => {})
        setMerging(false)
      }
    },
    [
      confirm,
      githubPR?.headSha,
      githubPR?.prRepo,
      githubPR?.mergeQueueRequired,
      githubPR?.stack,
      isCnb,
      isGitLab,
      defaultMergeMethod,
      onRefreshReview,
      repo,
      review.headSha,
      review.mergeQueueRequired,
      review.number,
      review.url
    ]
  )

  const handleAutoMerge = useCallback(async () => {
    if (isGitLab || isCnb || !autoMergeAction) {
      return
    }
    const enabled = autoMergeAction.kind === 'enable'
    setMerging(true)
    setActionError(null)
    try {
      const result = await setGitHubHostedReviewAutoMerge({
        repo,
        prNumber: review.number,
        enabled,
        method: enabled ? defaultMergeMethod : undefined,
        prRepo: githubPR?.prRepo ?? null
      })
      if (!result.ok) {
        setActionError(codeHostErrorText(result))
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Auto-merge update failed')
    } finally {
      setMerging(false)
      await onRefreshReview().catch(() => {})
    }
  }, [
    githubPR?.prRepo,
    isCnb,
    isGitLab,
    autoMergeAction,
    defaultMergeMethod,
    onRefreshReview,
    repo,
    review.number
  ])

  const handleReviewStateChange = useCallback(
    async (nextState: 'open' | 'closed') => {
      if (stateUpdating) {
        return
      }
      const isClosing = nextState === 'closed'
      const reviewRef = `${shortLabel} ${isGitLab ? '!' : '#'}${review.number}`
      const copy = getHostedReviewStateChangeCopy(isClosing, reviewRef, reviewLabel)
      const confirmed = await confirm({
        title: copy.title,
        description: copy.description,
        confirmLabel: copy.confirmLabel,
        confirmVariant: isClosing ? 'destructive' : 'default'
      })
      if (!confirmed) {
        return
      }
      setStateUpdating(nextState)
      setActionError(null)
      try {
        const result = isGitLab
          ? isClosing
            ? await gitLabApiFor({
                repoPath: repo.path,
                repoOwnerExecutionHostId: getRepoExecutionHostId(repo)
              }).closeMR({
                repoPath: repo.path,
                repoId: repo.id,
                iid: review.number
              })
            : await gitLabApiFor({
                repoPath: repo.path,
                repoOwnerExecutionHostId: getRepoExecutionHostId(repo)
              }).reopenMR({
                repoPath: repo.path,
                repoId: repo.id,
                iid: review.number
              })
          : isCnb
            ? await runCnbHostedReviewAction(repo, review.url, {
                kind: 'state',
                state: nextState
              })
            : await updateGitHubHostedReviewState({
                repo,
                prNumber: review.number,
                prRepo: githubPR?.prRepo ?? null,
                nextState
              })
        if (!result.ok) {
          const message = codeHostErrorText(result)
          setActionError(message)
          toast.error(message)
        } else {
          toast.success(
            isClosing
              ? translate(
                  'auto.components.right.sidebar.HostedReviewActions.closedToast',
                  '{{value0}} closed',
                  { value0: shortLabel }
                )
              : translate(
                  'auto.components.right.sidebar.HostedReviewActions.377269db6f',
                  '{{value0}} reopened',
                  { value0: shortLabel }
                )
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : copy.failure
        setActionError(message)
        toast.error(message)
      } finally {
        await onRefreshReview().catch(() => {})
        setStateUpdating(null)
      }
    },
    [
      confirm,
      githubPR?.prRepo,
      isCnb,
      isGitLab,
      onRefreshReview,
      repo,
      review.number,
      review.url,
      reviewLabel,
      shortLabel,
      stateUpdating
    ]
  )

  const handleCloseReview = useCallback(async () => {
    await handleReviewStateChange('closed')
  }, [handleReviewStateChange])

  const handleReopenReview = useCallback(async () => {
    await handleReviewStateChange('open')
  }, [handleReviewStateChange])

  return {
    merging,
    readying,
    stateUpdating,
    ...sourceBranchAction,
    actionError,
    handleMerge,
    handleAutoMerge,
    handleMarkReadyForReview,
    handleCloseReview,
    handleReopenReview
  }
}
