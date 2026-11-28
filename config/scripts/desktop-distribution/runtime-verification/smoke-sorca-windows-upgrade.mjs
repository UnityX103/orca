import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import {
  applySOrcaWindowsPackage,
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
} finally {
  await discardSOrcaWindowsPackage(staged.root).catch(console.warn)
}
