import type { GitStderrProgressTimeout } from '../git-exec-options'

export function startExecFileDeadline(
  timeout: number | undefined,
  progress: GitStderrProgressTimeout | undefined,
  onExpired: (timeoutMs: number) => void,
  isRunning: () => boolean
): { clear: () => void; expireIfDue: () => void; onStderr?: (chunk: string) => void } {
  const startedAt = performance.now()
  const timeoutMs = timeout ?? 0
  const maxDurationMs = progress?.maxDurationMs ?? Infinity
  const initialTimeoutMs = Math.min(timeoutMs, maxDurationMs)
  const hardDeadline = startedAt + maxDurationMs
  let deadline = initialTimeoutMs > 0 ? startedAt + initialTimeoutMs : null
  let timer: NodeJS.Timeout | undefined

  const clear = (): void => {
    deadline = null
    clearTimeout(timer)
  }
  const expire = (): void => {
    const expiredTimeoutMs = deadline === hardDeadline ? maxDurationMs : timeoutMs
    clear()
    onExpired(expiredTimeoutMs)
  }
  const tick = (): void => {
    if (deadline === null) {
      return
    }
    const remainingMs = deadline - performance.now()
    // Progress moves the deadline without rescheduling on every stderr record.
    if (progress && remainingMs > 0) {
      timer = setTimeout(tick, remainingMs)
      return
    }
    expire()
  }
  if (deadline !== null) {
    timer = setTimeout(tick, initialTimeoutMs)
  }

  const detect = progress?.createProgressDetector()
  return {
    clear,
    expireIfDue: () => {
      if (deadline !== null && performance.now() >= deadline) {
        expire()
      }
    },
    onStderr: detect
      ? (chunk) => {
          if (deadline === null || deadline === hardDeadline || !isRunning()) {
            return
          }
          const now = performance.now()
          if (now < deadline && detect(chunk)) {
            deadline = Math.min(now + timeoutMs, hardDeadline)
          }
        }
      : undefined
  }
}
