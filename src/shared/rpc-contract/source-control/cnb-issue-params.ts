import { z } from 'zod'

export const CnbIssueReference = z.object({ url: z.string().min(1).max(2048) })
