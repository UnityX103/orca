import { z } from 'zod'

/** IPC validation for CNB issue writes; `stateReason` pairs with a closed state. */
export const issueWriteRequest = z.object({
  repoId: z.string().min(1),
  number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  payload: z.discriminatedUnion('action', [
    z.object({
      action: z.literal('create'),
      title: z.string().min(1).max(255),
      body: z.string().max(65_536),
      labels: z.array(z.string().max(200)).max(10),
      assignees: z.array(z.string().max(100)).max(8)
    }),
    z.object({
      action: z.literal('update'),
      title: z.string().min(1).max(255).optional(),
      body: z.string().max(65_536).optional(),
      state: z.enum(['open', 'closed']).optional(),
      stateReason: z.enum(['completed', 'not_planned']).optional()
    }),
    z.object({ action: z.literal('comment'), body: z.string().min(1).max(65_536) }),
    z.object({ action: z.literal('labels'), labels: z.array(z.string().max(200)).max(10) }),
    z.object({ action: z.literal('assignees'), assignees: z.array(z.string().max(100)).max(8) }),
    z.object({
      action: z.literal('property'),
      key: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[A-Za-z0-9_]+$/),
      value: z.string().max(50)
    })
  ])
})

/** IPC validation for CNB pull request writes (update/reviewers/labels/review/merge). */
export const pullWriteRequest = z.object({
  repoId: z.string().min(1),
  number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  payload: z.discriminatedUnion('action', [
    z.object({
      action: z.literal('update'),
      title: z.string().min(1).max(255).optional(),
      body: z.string().max(65_536).optional(),
      state: z.enum(['open', 'closed']).optional()
    }),
    z.object({ action: z.literal('comment'), body: z.string().min(1).max(65_536) }),
    z.object({ action: z.literal('reviewers'), reviewers: z.array(z.string().max(100)).max(16) }),
    z.object({ action: z.literal('labels'), labels: z.array(z.string().max(200)).max(10) }),
    z.object({
      action: z.literal('review'),
      event: z.enum(['approve', 'comment', 'request_changes']),
      body: z.string().max(65_536)
    }),
    z.object({
      action: z.literal('merge'),
      style: z.enum(['merge', 'squash', 'rebase']),
      title: z.string().max(500),
      message: z.string().max(65_536)
    })
  ])
})
