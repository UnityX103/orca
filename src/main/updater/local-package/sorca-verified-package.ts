import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { extname } from 'node:path'
import { type Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { SOrcaLocalUpdateError } from '../../../shared/updater/sorca-local-update'

export type SOrcaPackageDigest = { size: number; sha256: string }
export type SOrcaPackageSource =
  | string
  | { open: () => Promise<Readable>; onProgress: (percent: number) => void }

export class SOrcaPackageError extends Error {
  constructor(readonly reason: SOrcaLocalUpdateError) {
    super(reason)
  }
}

export async function copyVerifiedPackage(
  source: SOrcaPackageSource,
  destination: string,
  expected: SOrcaPackageDigest,
  signal: AbortSignal
): Promise<void> {
  if (typeof source === 'string') {
    const stat = await lstat(source)
    if (
      !stat.isFile() ||
      extname(source).toLowerCase() !== extname(destination).toLowerCase() ||
      stat.size !== expected.size
    ) {
      throw new SOrcaPackageError('invalid-package')
    }
  }
  const hash = createHash('sha256')
  let copiedBytes = 0
  let lastPercent = 0
  const countAndHash = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      copiedBytes += chunk.length
      if (copiedBytes > expected.size) {
        callback(new SOrcaPackageError('invalid-package'))
        return
      }
      hash.update(chunk)
      if (typeof source !== 'string') {
        const percent = Math.min(99, Math.floor((copiedBytes / expected.size) * 100))
        if (percent !== lastPercent) {
          lastPercent = percent
          source.onProgress(percent)
        }
      }
      callback(null, chunk)
    }
  })
  await pipeline(
    typeof source === 'string' ? createReadStream(source) : await source.open(),
    countAndHash,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    { signal }
  )
  const digest = hash.digest('hex')
  if (digest !== expected.sha256 || copiedBytes !== expected.size) {
    throw new SOrcaPackageError('invalid-package')
  }
}
