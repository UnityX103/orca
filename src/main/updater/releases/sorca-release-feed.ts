import { net } from 'electron'
import type { ReleaseBuild } from '../../../shared/updater/release-channel'

const REPOSITORY = 'UnityX103/orca'
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`
const CI_BUILD = /^\d+\.\d+\.\d+\+sorca\.(\d{1,15})\.(\d{1,8})$/

type GitHubRelease = {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
  name?: unknown
  published_at?: unknown
  assets?: { name?: unknown; state?: unknown; size?: unknown }[]
}

export function isSOrcaVersion(version: string): boolean {
  return CI_BUILD.test(version) || /^\d+\.\d+\.\d+\+sorca\.native\.\d+$/.test(version)
}

function buildOrder(version: string): { run: number; attempt: number } {
  const match = CI_BUILD.exec(version)
  return { run: Number(match?.[1] ?? 0), attempt: Number(match?.[2] ?? 0) }
}

export function compareSOrcaBuilds(left: string, right: string): number {
  const a = buildOrder(left)
  const b = buildOrder(right)
  return a.run - b.run || a.attempt - b.attempt
}

export function sorcaReleaseBuilds(
  releases: readonly GitHubRelease[],
  platform: NodeJS.Platform,
  architecture: string
): ReleaseBuild[] {
  const installer =
    platform === 'darwin' && architecture === 'arm64'
      ? 'SOrca-macos-arm64.dmg'
      : platform === 'win32' && architecture === 'x64'
        ? 'SOrca-windows-x64.exe'
        : null
  if (!installer) {
    return []
  }
  return releases
    .flatMap((release): ReleaseBuild[] => {
      const tag = typeof release?.tag_name === 'string' ? release.tag_name : ''
      const version = tag.startsWith('v') ? tag.slice(1) : ''
      if (
        !CI_BUILD.test(version) ||
        release.draft !== false ||
        release.prerelease !== false ||
        !Array.isArray(release.assets) ||
        !release.assets.some(
          (asset) =>
            asset?.name === installer &&
            asset.state === 'uploaded' &&
            typeof asset.size === 'number' &&
            asset.size > 0
        )
      ) {
        return []
      }
      return [
        {
          tag,
          version,
          channel: 'stable',
          name: typeof release.name === 'string' ? release.name : null,
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
    throw new Error(`SOrca GitHub Releases returned HTTP ${response.status}`)
  }
  const releases: unknown = await response.json()
  if (!Array.isArray(releases)) {
    throw new Error('SOrca GitHub Releases returned an invalid response')
  }
  return sorcaReleaseBuilds(releases, process.platform, process.arch)
}
