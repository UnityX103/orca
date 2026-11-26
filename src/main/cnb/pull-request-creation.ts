import { z } from 'zod'
import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult
} from '../../shared/source-control/hosted-review/hosted-review-contracts'
import {
  normalizeHostedReviewBaseRef,
  normalizeHostedReviewHeadRef
} from '../../shared/source-control/hosted-review/hosted-review-refs'
import { getCnbCredentialToken } from './credentials'
import { cnbRepositoryPath } from './repository-ref'
import { cnbRequest } from './request'
import { numberField } from './task-schema'

const createdPull = z.object({ number: numberField })

const cnbAuthenticationRequired = {
  ok: false,
  code: 'auth_required',
  reason: 'auth_required',
  error: 'Connect CNB with pull request write access in Settings > Integrations.'
} as const

const cnbCreationUnconfirmed = {
  ok: false,
  code: 'unknown_completion',
  reason: 'creation_unconfirmed',
  error: 'CNB may have created the pull request. Refresh the branch review before retrying.'
} as const

export async function createCnbPullRequest(
  repository: string,
  input: CreateHostedReviewInput
): Promise<CreateHostedReviewResult> {
  const base = normalizeHostedReviewBaseRef(input.base)
  const head = normalizeHostedReviewHeadRef(input.head ?? '')
  const title = input.title.trim()
  if (!base || !head || !title) {
    return {
      ok: false,
      code: 'validation',
      reason: 'base_head_title_required',
      error: 'A base branch, head branch and title are required to create a CNB pull request.'
    }
  }
  const path = `${cnbRepositoryPath(repository)}/pulls`
  const token = await getCnbCredentialToken()
  if (!token) {
    return cnbAuthenticationRequired
  }
  try {
    const response = await cnbRequest(path, token, undefined, {
      method: 'POST',
      body: { base, head, head_repo: repository, title, body: input.body ?? '' },
      timeoutMs: 60_000
    })
    if (response.ok) {
      const { number } = createdPull.parse(await response.json())
      return { ok: true, number, url: `https://cnb.cool${path}/${number}` }
    }
    await response.body?.cancel().catch(() => undefined)
    if (response.status === 401 || response.status === 403) {
      return cnbAuthenticationRequired
    }
    if (response.status === 409) {
      return {
        ok: false,
        code: 'already_exists',
        reason: 'existing_review',
        error: 'A CNB pull request already exists for this branch.'
      }
    }
    if (response.status >= 500) {
      return cnbCreationUnconfirmed
    }
    return {
      ok: false,
      code: 'validation',
      reason: 'rejected',
      error: `CNB rejected the pull request (HTTP ${response.status}).`
    }
  } catch {
    return cnbCreationUnconfirmed
  }
}
