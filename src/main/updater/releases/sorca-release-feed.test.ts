import { expect, it } from 'vitest'
import { compareSOrcaBuilds, sorcaReleaseBuilds } from './sorca-release-feed'

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
