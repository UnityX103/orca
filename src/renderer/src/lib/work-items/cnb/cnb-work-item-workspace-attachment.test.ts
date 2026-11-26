import { expect, it } from 'vitest'
import type { WorkspaceAttachment } from '../../../../../shared/worktree/types'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { findCnbWorkItemWorkspaceAttachment } from './cnb-work-item-workspace-attachment'

it('requires a repository match for a folder attachment with a shared CNB issue number', () => {
  const issue: WorkspaceAttachment = { provider: 'cnb', type: 'issue', number: 7 }
  const folders = [
    makeWorktree({ id: 'folder:old', repoId: 'folder-project', linkedItems: [issue] }),
    makeWorktree({
      id: 'folder:other',
      repoId: 'folder-project',
      linkedItems: [{ ...issue, repoId: 'beta' }]
    }),
    makeWorktree({
      id: 'folder:pull',
      repoId: 'folder-project',
      linkedItems: [{ ...issue, type: 'pr', repoId: 'alpha' }]
    }),
    makeWorktree({
      id: 'folder:issue',
      repoId: 'folder-project',
      linkedItems: [{ ...issue, repoId: 'alpha' }]
    })
  ]

  expect(
    findCnbWorkItemWorkspaceAttachment(
      folders,
      'alpha',
      'issue',
      7,
      'https://cnb.cool/fixture/alpha/-/issues/7'
    )?.id
  ).toBe('folder:issue')
})
