import type { WorktreeCheckoutProgress } from '../../../../shared/worktree/create-types'
import { createGitProgressRecordReader } from '../../../../shared/git/commands/git-progress-records'

/** Receives checkout progress; `null` means git finished writing the files. */
export type WorktreeCheckoutProgressListener = (progress: WorktreeCheckoutProgress | null) => void

export type WorktreeCheckoutProgressReader = {
  read: (stderrChunk: string) => void
  /** Stops all reporting; call once the git process has settled. */
  close: () => void
}

export function createWorktreeCheckoutProgressDetector(): (chunk: string) => boolean {
  let advanced = false
  const readers = ['Updating files', 'Filtering content'].map((title) => {
    let completed = 0
    return createGitProgressRecordReader(title, (record) => {
      if (record.completed > completed) {
        completed = record.completed
        advanced = true
      }
    })
  })
  return (chunk) => {
    advanced = false
    for (const read of readers) {
      read(chunk)
    }
    return advanced
  }
}

/** Parse Git's existing Updating files meter synchronously; close stops further reports. */
export function createWorktreeCheckoutProgressReader(
  onProgress: WorktreeCheckoutProgressListener
): WorktreeCheckoutProgressReader {
  let lastPercent = -1
  let closed = false
  const read = createGitProgressRecordReader('Updating files', (record) => {
    if (closed) {
      return
    }
    if (record.done) {
      closed = true
      onProgress(null)
      return
    }
    // Suppress same-percent timer reprints to keep reports near 100.
    if (record.percent <= lastPercent) {
      return
    }
    lastPercent = record.percent
    onProgress({ percent: record.percent, completed: record.completed, total: record.total })
  })
  return {
    read,
    close: () => {
      closed = true
    }
  }
}
