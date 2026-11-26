import { net } from 'electron'
import type { ReleaseBuild } from '../../../shared/updater/release-channel'
import { compareAppVersions } from '../../../shared/app-lifecycle/identity/app-version'
import { SORCA_RELEASE_VERSION } from '../../../shared/app-lifecycle/identity/sorca-build-version'

const REPOSITORY = 'UnityX103/orca'
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`

type GitHubRelease = {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
  name?: unknown
  published_at?: unknown
  assets?: { name?: unknown; state?: unknown; size?: unknown }[]
}

function buildOrder(version: string): { run: number; attempt: number } {
  const match = SORCA_RELEASE_VERSION.exec(version)
  return { run: Number(match?.[1] ?? 0), attempt: Number(match?.[2] ?? 0) }
}

export function compareSOrcaBuilds(left: string, right: string): number {
  const a = buildOrder(left)
  const b = buildOrder(right)
  return compareAppVersions(left, right) || a.run - b.run || a.attempt - b.attempt
}

export function sorcaReleaseBuilds(
  releases: readonly GitHubRelease[],
  platform: NodeJS.Platform,
  architecture: string
): ReleaseBuild[] {
  const installerNames =
    platform === 'darwin' && architecture === 'arm64'
      ? ['orca-macos-arm64.dmg', 'SOrca-macos-arm64.dmg']
      : platform === 'win32' && architecture === 'x64'
        ? ['orca-windows-setup.exe', 'SOrca-windows-x64.exe']
        : []
  if (!installerNames.length) {
    return []
  }
  return releases
    .flatMap((release): ReleaseBuild[] => {
      const tag = typeof release?.tag_name === 'string' ? release.tag_name : ''
      const version = tag.startsWith('v') ? tag.slice(1) : ''
      if (
        !SORCA_RELEASE_VERSION.test(version) ||
        release.draft !== false ||
        release.prerelease !== false ||
        !Array.isArray(release.assets)
      ) {
        return []
      }
      const assets = release.assets
      const installer = installerNames.find((name) =>
        assets.some(
          (asset) =>
            asset?.name === name &&
            asset.state === 'uploaded' &&
            typeof asset.size === 'number' &&
            asset.size > 0
        )
      )
      if (!installer) {
        return []
      }
      return [
        {
          tag,
          version,
          channel: 'stable',
          name: typeof release.name === 'string' ? release.name.replace(/^SOrca\b/, 'Orca') : null,
          publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
          releaseUrl: `${RELEASES_URL}/tag/${encodeURIComponent(tag)}`,
          installerUrl: `${RELEASES_URL}/download/${encodeURIComponent(tag)}/${installer}`
        }
      ]
    })
    .sort((left, right) => compareSOrcaBuilds(right.version, left.version))
}

export async function listSOrcaReleaseBuilds(): Promise<ReleaseBuild[]> {
  const response = await net.fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8_000)
  })
  if (!response.ok) {
    throw new Error(`Orca GitHub Releases returned HTTP ${response.status}`)
  }
  const releases: unknown = await response.json()
  if (!Array.isArray(releases)) {
    throw new Error('Orca GitHub Releases returned an invalid response')
  }
  return sorcaReleaseBuilds(releases, process.platform, process.arch)
}
