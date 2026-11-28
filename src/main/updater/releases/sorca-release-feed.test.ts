import { net } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import {
  compareSOrcaBuilds,
  listSOrcaReleaseBuilds,
  sorcaReleaseBuilds
} from './sorca-release-feed'

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))

afterEach(() => {
  vi.useRealTimers()
})

it('offers the Orca installer and keeps previously published installers reachable', () => {
  const asset = { name: 'SOrca-macos-arm64.dmg', state: 'uploaded', size: 100 }
  const namedOrca = { ...asset, name: 'orca-macos-arm64.dmg' }
  const release = { draft: false, prerelease: false }
  const builds = sorcaReleaseBuilds(
    [
      { ...release, tag_name: 'v1.4.274+sorca.202.2', assets: [] },
      { ...release, tag_name: 'v1.4.274+sorca.202.1', draft: true, assets: [asset] },
      { ...release, tag_name: 'v1.4.274+sorca.201.2', assets: [asset] },
      { ...release, tag_name: 'v1.4.277+build.100.1', assets: [asset, namedOrca] },
      { ...release, tag_name: 'v1.5.0', assets: [asset] },
      { ...release, tag_name: 'v1.4.274+sorca.200.3', assets: [asset] }
    ],
    'darwin',
    'arm64'
  )
  expect(builds.map((build) => build.version)).toEqual([
    '1.4.277+build.100.1',
    '1.4.274+sorca.201.2',
    '1.4.274+sorca.200.3'
  ])
  expect(builds[0]?.installerUrl).toBe(
    'https://github.com/UnityX103/orca/releases/download/v1.4.277%2Bbuild.100.1/orca-macos-arm64.dmg'
  )
  expect(builds[1]?.installerUrl).toBe(
    'https://github.com/UnityX103/orca/releases/download/v1.4.274%2Bsorca.201.2/SOrca-macos-arm64.dmg'
  )
  expect(compareSOrcaBuilds('1.4.274+sorca.201.2', '1.4.274+sorca.201.1')).toBeGreaterThan(0)
  expect(compareSOrcaBuilds('1.4.274+sorca.201.2', '1.4.274+sorca.native.1')).toBeGreaterThan(0)
})

it('offers an in-app Mac update only for a release with the signing marker and a valid DMG digest', () => {
  const hash = 'e2'.repeat(32)
  const image = {
    name: 'orca-macos-arm64.dmg',
    state: 'uploaded',
    size: 101,
    digest: `sha256:${hash}`
  }
  const marker = { name: 'orca-macos-arm64-update.json', state: 'uploaded', size: 32 }
  const release = { draft: false, prerelease: false }
  const builds = sorcaReleaseBuilds(
    [
      { ...release, tag_name: 'v1.4.280+build.46098182992.1', assets: [image] },
      { ...release, tag_name: 'v1.4.280+build.46098182992.2', assets: [image, marker] },
      {
        ...release,
        tag_name: 'v1.4.280+build.46098182992.3',
        assets: [{ ...image, digest: 'sha256:invalid' }, marker]
      }
    ],
    'darwin',
    'arm64'
  )

  expect(builds.map((entry) => entry.macUpdate)).toEqual([
    undefined,
    {
      url: 'https://github.com/UnityX103/orca/releases/download/v1.4.280%2Bbuild.46098182992.2/orca-macos-arm64.dmg',
      size: 101,
      sha256: hash
    },
    undefined
  ])
})

it('only stages the original Windows installer when GitHub supplies a verified asset digest', () => {
  const exe = {
    name: 'orca-windows-setup.exe',
    state: 'uploaded',
    size: 123,
    digest: `sha256:${'ab'.repeat(32)}`
  }
  const checksums = { name: 'SHA256SUMS.txt', state: 'uploaded', size: 200 }
  const release = { draft: false, prerelease: false }
  const builds = sorcaReleaseBuilds(
    [
      { ...release, tag_name: 'v1.4.280+build.100.3', assets: [exe] },
      { ...release, tag_name: 'v1.4.280+build.100.2', assets: [exe, checksums] },
      {
        ...release,
        tag_name: 'v1.4.280+build.100.1',
        assets: [{ ...exe, name: 'SOrca-windows-x64.exe' }, checksums]
      }
    ],
    'win32',
    'x64'
  )
  expect(builds.map(({ windowsUpdate }) => windowsUpdate?.sha256)).toEqual([
    undefined,
    'ab'.repeat(32),
    undefined
  ])
})

it('reuses the last successful release list during a GitHub rate-limit window', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  const hash = 'cd'.repeat(32)
  const releases = [
    {
      tag_name: 'v1.4.280+build.100.1',
      draft: false,
      prerelease: false,
      assets: [
        {
          name: 'orca-macos-arm64.dmg',
          state: 'uploaded',
          size: 101,
          digest: `sha256:${hash}`
        },
        { name: 'orca-macos-arm64-update.json', state: 'uploaded', size: 32 }
      ]
    }
  ]
  const fetchMock = vi.mocked(net.fetch)
  fetchMock.mockReset()
  fetchMock
    .mockResolvedValueOnce(new Response(JSON.stringify(releases), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(null, {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.parse('2026-01-01T01:00:00Z') / 1000))
        }
      })
    )

  const first = await listSOrcaReleaseBuilds()
  const duringLimit = await listSOrcaReleaseBuilds()
  const withoutAnotherRequest = await listSOrcaReleaseBuilds()

  expect(duringLimit).toEqual(first)
  expect(withoutAnotherRequest).toEqual(first)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
