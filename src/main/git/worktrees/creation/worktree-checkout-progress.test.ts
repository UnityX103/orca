import { expect, it } from 'vitest'
import {
  createGitProgressRecordReader,
  type GitProgressRecord
} from '../../../../shared/git/commands/git-progress-records'
import { createWorktreeCheckoutProgressDetector } from './worktree-checkout-progress'

it('recognizes new checkout counts across partial records and independent Git meters', () => {
  const detect = createWorktreeCheckoutProgressDetector()

  expect(detect('Updating files:   0% (0/1000)\r')).toBe(false)
  expect(detect('Updating files:   0% (1/10')).toBe(false)
  expect(detect('00)\r')).toBe(true)
  expect(detect('Updating files:   0% (1/1000)\r')).toBe(false)
  expect(detect('Updating files:   0% (2/1000)\r')).toBe(true)
  expect(detect('Updating files: 100% (1010/1000)\rwarning: unrelated\n')).toBe(false)
  expect(detect('Updating files: 100% (1000/1000), done.\n')).toBe(true)

  // A wrapped filtering meter has a smaller counter and may include a transfer rate.
  expect(detect('Filtering content:\r\n  1% (1/53), 3.')).toBe(false)
  expect(detect('00 MiB | 42.10 MiB/s\r')).toBe(true)
  expect(detect('  1% (1/53), 4.00 MiB | 42.10 MiB/s\r')).toBe(false)
  expect(detect('  0% (0/53)\r')).toBe(false)
  expect(detect('100% (53/53), 3.53 GiB | 42.10 MiB/s, done.\n')).toBe(true)
})

it('recognizes the end of a Git progress record after transfer statistics', () => {
  const records: GitProgressRecord[] = []
  const read = createGitProgressRecordReader('Filtering content', (record) => records.push(record))
  read('Filtering content: 100% (53/53), 3.53 GiB | 42.10 MiB/s, do')
  read('ne.\n')

  expect(records).toEqual([{ percent: 100, completed: 53, total: 53, done: true }])
})
