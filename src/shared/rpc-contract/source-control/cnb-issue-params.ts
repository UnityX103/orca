import { z } from 'zod'
import { lazyZodSchema } from '../../schema/lazy-zod-schema'

export const CnbIssueReference = lazyZodSchema(() => z.object({ url: z.string().min(1).max(2048) }))
