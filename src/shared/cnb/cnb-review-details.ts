export type CnbReviewDetails = {
  description: string
  comments: { id: string; author: string; body: string }[]
  files: {
    path: string
    additions: number
    deletions: number
    patch: string | null
    patchTruncated: boolean
  }[]
  filesTruncated: boolean
}
