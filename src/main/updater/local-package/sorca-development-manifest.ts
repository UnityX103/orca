import { lstat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { lazyZodSchema } from '../../../shared/schema/lazy-zod-schema'
import { SORCA_DEVELOPMENT_VERSION } from '../../../shared/app-lifecycle/identity/sorca-build-version'

export const sorcaDevelopmentDirectory = join(homedir(), '.orca', 'sorca-development')
export const sorcaDevelopmentManifest = join(sorcaDevelopmentDirectory, 'latest.json')

const localPackage = lazyZodSchema(() =>
  z.object({
    version: z.string().regex(SORCA_DEVELOPMENT_VERSION),
    path: z.string().refine((value) => isAbsolute(value) && extname(value) === '.dmg'),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
)

export type SOrcaDevelopmentPackage = z.infer<typeof localPackage>

export async function readSOrcaDevelopmentPackage(): Promise<SOrcaDevelopmentPackage | null> {
  try {
    const stat = await lstat(sorcaDevelopmentManifest)
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0) {
      return null
    }
    return localPackage.parse(JSON.parse(await readFile(sorcaDevelopmentManifest, 'utf8')))
  } catch {
    return null
  }
}
