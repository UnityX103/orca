import { useEffect, useState } from 'react'
import type { CnbReviewDetails } from '../../../../../../shared/cnb/cnb-review-details'
import type { HostedReviewInfo } from '../../../../../../shared/source-control/hosted-review/hosted-review-contracts'
import CommentMarkdown from '@/components/comment-markdown/CommentMarkdown'
import { useTranslate } from '@/i18n/use-translate'

export function CnbReviewDetailsContent({
  review,
  refreshing
}: {
  review: HostedReviewInfo
  refreshing: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const [details, setDetails] = useState<CnbReviewDetails | null>(null)
  const [error, setError] = useState(false)
  const { url, updatedAt } = review
  useEffect(() => {
    const api = window.api.cnb
    if (!api || refreshing) {
      return
    }
    let active = true
    void api.reviewDetails(url).then(
      (next) => {
        if (active) {
          setDetails(next)
          setError(false)
        }
      },
      () => {
        if (active) {
          setError(true)
        }
      }
    )
    return () => {
      active = false
    }
  }, [url, updatedAt, refreshing])

  return (
    <div className="space-y-4 px-3 py-3 text-xs">
      {review.checksSummary && (
        <p className="text-muted-foreground">
          {t('cnb.review.checks', '{{passed}} passed · {{failed}} failed · {{pending}} pending', {
            passed: review.checksSummary.passed,
            failed: review.checksSummary.failed,
            pending: review.checksSummary.pending
          })}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {t(
            'cnb.review.loadError',
            'Could not load CNB review details. Check Settings > Integrations, then refresh.'
          )}
        </p>
      ) : !details && window.api.cnb ? (
        <p role="status" className="text-muted-foreground">
          {t('cnb.review.loading', 'Loading review details…')}
        </p>
      ) : null}
      {details?.description && (
        <section className="space-y-2">
          <h3 className="font-semibold">{t('cnb.review.description', 'Description')}</h3>
          <CommentMarkdown content={details.description} />
        </section>
      )}
      {details && (
        <>
          <section className="space-y-2">
            <h3 className="font-semibold">{t('cnb.review.files', 'Changed files')}</h3>
            {details.files.length === 0 && (
              <p className="text-muted-foreground">
                {t('cnb.review.noFiles', 'No changed files.')}
              </p>
            )}
            {details.files.map((file) => (
              <details key={file.path} className="rounded-md border border-border">
                <summary className="cursor-pointer break-all px-2 py-1.5">
                  <span className="font-mono">{file.path}</span>{' '}
                  <span className="text-muted-foreground">
                    +{file.additions} −{file.deletions}
                  </span>
                </summary>
                {file.patch ? (
                  <pre className="scrollbar-sleek max-h-80 overflow-auto border-t border-border px-2 py-1.5 font-mono">
                    {file.patch}
                  </pre>
                ) : null}
                {(!file.patch || file.patchTruncated) && (
                  <p className="px-2 py-1.5 text-muted-foreground">
                    {t(
                      'cnb.review.noPatch',
                      'Open this pull request on CNB to view the full diff.'
                    )}
                  </p>
                )}
              </details>
            ))}
            {details.filesTruncated && (
              <p className="text-muted-foreground">
                {t('cnb.review.moreFiles', 'Open on CNB to see all changed files.')}
              </p>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold">{t('cnb.review.discussion', 'Discussion')}</h3>
            {details.comments.length === 0 && (
              <p className="text-muted-foreground">{t('cnb.review.noComments', 'No comments.')}</p>
            )}
            {details.comments.map((comment) => (
              <div key={comment.id} className="space-y-1 rounded-md border border-border p-2">
                {comment.author && <p className="font-medium">{comment.author}</p>}
                <CommentMarkdown content={comment.body} />
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
