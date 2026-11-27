import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { expect, it, vi } from 'vitest'
import { deleteCnbSourceBranch } from './pull-source-branch'

it('leaves a merged CNB source branch intact when it moved after the API read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cnb-branch-lease-'))
  const remote = join(root, 'remote.git')
  const branch = 'feature/review'
  const ref = `refs/heads/${branch}`
  const repository = 'example/repo'
  const git = async (...args: string[]): Promise<string> => {
    const result = await runProcess({ program: 'git', args, cwd: root })
    expect(result.code, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  try {
    await git('init')
    await git('symbolic-ref', 'HEAD', 'refs/heads/main')
    await git('config', 'user.name', 'Orca Test')
    await git('config', 'user.email', 'test@example.com')
    await git('config', 'protocol.https.allow', 'never')
    await git('-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'Reviewed')
    const reviewed = await git('rev-parse', 'HEAD')
    await git('init', '--bare', remote)
    await git('--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main')
    await git('push', remote, 'HEAD:refs/heads/main')
    await git('-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'New work')
    const newer = await git('rev-parse', 'HEAD')
    await git('push', remote, `HEAD:${ref}`)
    await git(
      'config',
      `url.${pathToFileURL(remote).href}.insteadOf`,
      'https://cnb.cool/example/repo'
    )
    let apiHead = reviewed
    vi.stubGlobal('fetch', async () =>
      Response.json({ protected: false, locked: false, commit: { sha: apiHead } })
    )
    const options = { repoPath: root, repository, branch, token: 'test', localGitOptions: {} }
    expect(await deleteCnbSourceBranch({ ...options, expectedHeadSha: reviewed })).toMatchObject({
      ok: false
    })
    expect(await git('--git-dir', remote, 'rev-parse', ref)).toBe(newer)

    apiHead = newer
    expect(await deleteCnbSourceBranch({ ...options, expectedHeadSha: newer })).toEqual({
      ok: true
    })
    expect(await git('--git-dir', remote, 'for-each-ref', '--format=%(refname)', ref)).toBe('')
  } finally {
    vi.unstubAllGlobals()
    await rm(root, { recursive: true, force: true })
  }
})
