import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  getOrcaProfileIndexPath,
  legacyBackupPath,
  legacyDataFilePath
} from '../../orca-profiles/profile-storage-paths'

type ProfileName = 'orca' | 'SOrca'

export type SOrcaProfileLocation = { name: ProfileName; path: string }

type Selection =
  | { kind: 'use'; profile: SOrcaProfileLocation; remember: boolean }
  | { kind: 'choose'; profiles: SOrcaProfileLocation[]; missingPath?: string }

function selectionFile(appData: string): string {
  return join(appData, '.sorca-profile-location')
}

function readSelection(appData: string): ProfileName | null {
  try {
    const name = readFileSync(selectionFile(appData), 'utf8').trim()
    return name === 'orca' || name === 'SOrca' ? name : null
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function hasProfileData(path: string): boolean {
  const index = getOrcaProfileIndexPath(path)
  return [
    index,
    `${index}.bak`,
    legacyDataFilePath(path),
    legacyBackupPath(path, 1),
    join(path, 'profiles')
  ].some((candidate) => existsSync(candidate))
}

export function resolveSOrcaProfileLocation(appData: string): Selection {
  const shared = { name: 'orca', path: join(appData, 'orca') } as const
  const legacy = { name: 'SOrca', path: join(appData, 'SOrca') } as const
  const existing = [legacy, shared].filter(({ path }) => hasProfileData(path))
  const saved = readSelection(appData)
  if (saved) {
    const profile = saved === 'SOrca' ? legacy : shared
    if (!existing.some(({ name }) => name === saved)) {
      return { kind: 'choose', profiles: existing, missingPath: profile.path }
    }
    return { kind: 'use', profile, remember: false }
  }
  if (existing.length > 1) {
    const a = statSync(legacy.path)
    const b = statSync(shared.path)
    if (a.dev !== b.dev || a.ino !== b.ino) {
      return { kind: 'choose', profiles: existing }
    }
    return { kind: 'use', profile: shared, remember: true }
  }
  return { kind: 'use', profile: existing[0] ?? shared, remember: existing.length === 1 }
}

export async function rememberSOrcaProfileLocation(
  appData: string,
  name: ProfileName
): Promise<void> {
  const path = selectionFile(appData)
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${name}\n`, { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
