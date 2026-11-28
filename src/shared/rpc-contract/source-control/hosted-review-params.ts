import { z } from 'zod'
import { lazyZodSchema } from '../../schema/lazy-zod-schema'
import { OptionalBoolean, requiredString } from '../rpc-param-primitives'
import { OptionalGitAdmissionTier } from './git-admission-tier-params'

export const HostedReviewForBranch = lazyZodSchema(() =>
  z.object({
    repo: requiredString('Missing repo selector'),
    branch: requiredString('Missing branch'),
    force: z.boolean().optional(),
    userRefresh: z.boolean().optional(),
    reportReadOutcome: z.boolean().optional(),
    admissionTier: OptionalGitAdmissionTier,
    currentHeadOid: z.string().nullable().optional(),
    // Only the caller's selected worktree; the host caps how many earn the fast tier.
    active: z.boolean().optional(),
    linkedGitHubPR: z.number().int().positive().nullable().optional(),
    fallbackGitHubPR: z.number().int().positive().nullable().optional(),
    linkedGitLabMR: z.number().int().positive().nullable().optional(),
    linkedBitbucketPR: z.number().int().positive().nullable().optional(),
    linkedAzureDevOpsPR: z.number().int().positive().nullable().optional(),
    linkedGiteaPR: z.number().int().positive().nullable().optional()
  })
)

export const HostedReviewCreationEligibility = lazyZodSchema(() =>
  z.object({
    repo: requiredString('Missing repo selector'),
    worktree: z.string().min(1, 'Missing worktree selector').optional(),
    branch: requiredString('Missing branch'),
    base: z.string().nullable().optional(),
    hasUncommittedChanges: z.boolean().optional(),
    hasUpstream: z.boolean().optional(),
    ahead: z.number().int().nonnegative().optional(),
    behind: z.number().int().nonnegative().optional(),
    linkedGitHubPR: z.number().int().positive().nullable().optional(),
    fallbackGitHubPR: z.number().int().positive().nullable().optional(),
    linkedGitLabMR: z.number().int().positive().nullable().optional(),
    linkedBitbucketPR: z.number().int().positive().nullable().optional(),
    linkedAzureDevOpsPR: z.number().int().positive().nullable().optional(),
    linkedGiteaPR: z.number().int().positive().nullable().optional(),
    currentHeadOid: z.string().nullable().optional(),
    /** The user's Create PR; older hosts drop it. */
    wakeWslDistro: OptionalBoolean
  })
)

export const HostedReviewCreate = lazyZodSchema(() =>
  z.object({
    repo: requiredString('Missing repo selector'),
    worktree: z.string().min(1, 'Missing worktree selector').optional(),
    // Keep provider open: clients echo a newer host’s eligibility token; the handler refuses unsupported providers.
    provider: z.string(),
    base: requiredString('Missing base branch'),
    head: z.string().optional(),
    title: requiredString('Missing title'),
    body: z.string().optional(),
    draft: z.boolean().optional(),
    useTemplate: z.boolean().optional()
  })
)

const cnbHeadSha = lazyZodSchema(() => z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i))

export const CnbHostedReviewMutation = lazyZodSchema(() =>
  z.object({
    repo: requiredString('Missing repo selector'),
    reviewUrl: z.string().max(2048),
    action: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('merge'),
        method: z.enum(['merge', 'squash', 'rebase']),
        expectedHeadSha: cnbHeadSha
      }),
      z.object({ kind: z.literal('state'), state: z.enum(['open', 'closed']) }),
      z.object({
        kind: z.literal('delete-source-branch'),
        branch: z.string().min(1).max(1024),
        expectedHeadSha: cnbHeadSha
      })
    ])
  })
)

export type CnbHostedReviewMutationInput = z.infer<typeof CnbHostedReviewMutation>
