import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rememberSOrcaProfileLocation, resolveSOrcaProfileLocation } from './sorca-profile-location'

describe('SOrca upgrade profile location', () => {
  let appData: string

  beforeEach(async () => {
    appData = await mkdtemp(join(tmpdir(), 'sorca-upgrade-'))
  })

  afterEach(async () => {
    await rm(appData, { recursive: true, force: true })
  })

  async function seedLegacyProfile(): Promise<string> {
    const old = join(appData, 'SOrca')
    await mkdir(old)
    await writeFile(join(old, 'orca-data.json'), '{"repos":[{"path":"/existing-project"}]}')
    return old
  }

  async function seedSharedProfile(): Promise<string> {
    const shared = join(appData, 'orca')
    await mkdir(join(shared, 'profiles'), { recursive: true })
    return shared
  }

  it('reuses the legacy SOrca root without changing its Electron identity', async () => {
    const path = await seedLegacyProfile()
    expect(await resolveSOrcaProfileLocation(appData)).toEqual({
      kind: 'use',
      profile: { name: 'SOrca', path },
      remember: true
    })
  })

  it('reuses an existing shared Orca profile', async () => {
    const path = await seedSharedProfile()
    expect(await resolveSOrcaProfileLocation(appData)).toEqual({
      kind: 'use',
      profile: { name: 'orca', path },
      remember: true
    })
  })

  it('keeps a selected profile across upgrades when both locations contain data', async () => {
    const legacy = await seedLegacyProfile()
    const shared = await seedSharedProfile()
    expect(await resolveSOrcaProfileLocation(appData)).toEqual({
      kind: 'choose',
      profiles: [
        { name: 'SOrca', path: legacy },
        { name: 'orca', path: shared }
      ]
    })
    await rememberSOrcaProfileLocation(appData, 'SOrca')
    expect(await resolveSOrcaProfileLocation(appData)).toEqual({
      kind: 'use',
      profile: { name: 'SOrca', path: legacy },
      remember: false
    })
    await rename(legacy, join(appData, 'moved'))
    expect(await resolveSOrcaProfileLocation(appData)).toEqual({
      kind: 'choose',
      profiles: [{ name: 'orca', path: shared }],
      missingPath: legacy
    })
  })
})
