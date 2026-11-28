import { net } from 'electron'
import { Readable } from 'node:stream'
import type { SOrcaReleaseAsset } from '../releases/sorca-release-feed'
import type { SOrcaPackageSource } from './sorca-verified-package'

export function sorcaReleasePackageSource(
  { url }: SOrcaReleaseAsset,
  signal: AbortSignal,
  onProgress: (percent: number) => void
): Exclude<SOrcaPackageSource, string> {
  return {
    open: async () => {
      const response = await net.fetch(url, { signal, credentials: 'omit' })
      const body = response.body
      if (!response.ok || !body) {
        await body?.cancel().catch(() => {})
        throw new Error(`Orca update download returned HTTP ${response.status}`)
      }
      return Readable.from(
        (async function* () {
          const reader = body.getReader()
          try {
            for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
              yield chunk.value
            }
          } finally {
            await reader.cancel().catch(() => {})
            reader.releaseLock()
          }
        })(),
        { objectMode: false }
      )
    },
    onProgress
  }
}
