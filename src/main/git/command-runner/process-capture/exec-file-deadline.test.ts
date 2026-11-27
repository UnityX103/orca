import { expect, it, vi } from 'vitest'
import { startExecFileDeadline } from './exec-file-deadline'

it('advancing output cannot revive a stopped checkout or extend it past its total limit', () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
  try {
    const expired: number[] = []
    const progress = { maxDurationMs: 250, createProgressDetector: () => () => true }
    const first = startExecFileDeadline(
      100,
      progress,
      (limit) => expired.push(limit),
      () => true
    )
    vi.advanceTimersByTime(60)
    first.onStderr?.('progress')
    vi.advanceTimersByTime(60)
    expect(expired).toEqual([])

    first.clear()
    first.onStderr?.('late output')
    vi.advanceTimersByTime(250)
    expect(expired).toEqual([])

    const second = startExecFileDeadline(
      100,
      progress,
      (limit) => expired.push(limit),
      () => true
    )
    for (let record = 0; record < 4; record++) {
      vi.advanceTimersByTime(60)
      second.onStderr?.('progress')
    }
    vi.advanceTimersByTime(10)
    second.onStderr?.('late output')
    vi.advanceTimersByTime(250)
    expect(expired).toEqual([250])
  } finally {
    vi.useRealTimers()
  }
})
