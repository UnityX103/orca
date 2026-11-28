import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  applySOrcaWindowsPackage,
  clearCompletedSOrcaWindowsUpdates,
  discardSOrcaWindowsPackage,
  stageSOrcaWindowsPackage
} from '../../../../src/main/updater/local-package/sorca-windows-update-package.ts'

const [path, executable, previousVersion, version] = process.argv.slice(2)
assert.ok(path && executable && previousVersion && version)
const { size } = await stat(path)
const hash = createHash('sha256')
for await (const chunk of createReadStream(path)) {
  hash.update(chunk)
}
const staged = await stageSOrcaWindowsPackage({
  source: { open: async () => createReadStream(path), onProgress: () => {} },
  executable,
  userDataPath: dirname(executable),
  expected: { size, sha256: hash.digest('hex') },
  version,
  signal: AbortSignal.timeout(120_000)
})
try {
  const installer = await applySOrcaWindowsPackage(
    staged,
    executable,
    previousVersion,
    false,
    () => true
  )
  assert.ok(installer, 'An eligible update must dispatch the NSIS installer')
  installer.ref()
  const [exitCode] = await once(installer, 'exit', { signal: AbortSignal.timeout(180_000) })
  assert.equal(exitCode, 0)
  assert.equal(await readFile(join(staged.root, 'sorca-update-result.txt'), 'utf8'), 'installed')
  await clearCompletedSOrcaWindowsUpdates(dirname(executable))
  await assert.rejects(stat(staged.root), { code: 'ENOENT' })
} finally {
  await discardSOrcaWindowsPackage(staged.root).catch(console.warn)
}
