import { expect, it } from 'vitest'
import { compareSOrcaBuilds, sorcaReleaseBuilds } from './sorca-release-feed'

it('offers only published SOrca installers for the requested architecture', () => {
  const asset = { name: 'SOrca-macos-arm64.dmg', state: 'uploaded', size: 100 }
  const release = { draft: false, prerelease: false }
  const builds = sorcaReleaseBuilds(
    [
      { ...release, tag_name: 'v1.4.274+sorca.202.2', assets: [] },
      { ...release, tag_name: 'v1.4.274+sorca.202.1', draft: true, assets: [asset] },
      { ...release, tag_name: 'v1.4.274+sorca.201.2', assets: [asset] },
      { ...release, tag_name: 'v1.5.0', assets: [asset] },
      { ...release, tag_name: 'v1.4.274+sorca.200.3', assets: [asset] }
    ],
    'darwin',
    'arm64'
  )
  expect(builds.map((build) => build.version)).toEqual([
    '1.4.274+sorca.201.2',
    '1.4.274+sorca.200.3'
  ])
  expect(builds[0]?.installerUrl).toBe(
    'https://github.com/UnityX103/orca/releases/download/v1.4.274%2Bsorca.201.2/SOrca-macos-arm64.dmg'
  )
  expect(compareSOrcaBuilds('1.4.274+sorca.201.2', '1.4.274+sorca.201.1')).toBeGreaterThan(0)
  expect(compareSOrcaBuilds('1.4.274+sorca.201.2', '1.4.274+sorca.native.1')).toBeGreaterThan(0)
})
