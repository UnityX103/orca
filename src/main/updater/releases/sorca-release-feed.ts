import { net } from 'electron'
import type { ReleaseBuild } from '../../../shared/updater/release-channel'
import { SORCA_RELEASE_VERSION } from '../../../shared/app-lifecycle/identity/sorca-build-version'
import { compareSOrcaBuilds } from './sorca-build-order'

export { compareSOrcaBuilds } from './sorca-build-order'

const REPOSITORY = 'UnityX103/orca'
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`
const MAC_UPDATE_MARKER = 'orca-macos-arm64-update.json'

type GitHubAsset = { name?: unknown; state?: unknown; size?: unknown; digest?: unknown }

export type SOrcaReleaseBuild = ReleaseBuild & {
  macUpdate?: { url: string; size: number; sha256: string }
}

type GitHubRelease = {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
  name?: unknown
  published_at?: unknown
  assets?: GitHubAsset[]
}

function uploadedAsset(asset: GitHubAsset, name: string): asset is GitHubAsset & { size: number } {
  return (
    asset?.name === name &&
    asset.state === 'uploaded' &&
    typeof asset.size === 'number' &&
    Number.isSafeInteger(asset.size) &&
    asset.size > 0
  )
}

export function sorcaReleaseBuilds(
  releases: readonly GitHubRelease[],
  platform: NodeJS.Platform,
  architecture: string
): SOrcaReleaseBuild[] {
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
    .flatMap((release): SOrcaReleaseBuild[] => {
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
        assets.some((asset) => uploadedAsset(asset, name))
      )
      if (!installer) {
        return []
      }
      const installerUrl = `${RELEASES_URL}/download/${encodeURIComponent(tag)}/${installer}`
      const macDmg =
        platform === 'darwin' &&
        installer === 'orca-macos-arm64.dmg' &&
        assets.some((asset) => uploadedAsset(asset, MAC_UPDATE_MARKER))
          ? assets.find((asset): asset is GitHubAsset & { size: number } =>
              uploadedAsset(asset, installer)
            )
          : undefined
      const sha256 =
        typeof macDmg?.digest === 'string'
          ? /^sha256:([a-f0-9]{64})$/.exec(macDmg.digest)?.[1]
          : undefined
      return [
        {
          tag,
          version,
          channel: 'stable',
          name: typeof release.name === 'string' ? release.name.replace(/^SOrca\b/, 'Orca') : null,
          publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
          releaseUrl: `${RELEASES_URL}/tag/${encodeURIComponent(tag)}`,
          installerUrl,
          ...(macDmg && sha256
            ? { macUpdate: { url: installerUrl, size: macDmg.size, sha256 } }
            : {})
        }
      ]
    })
    .sort((left, right) => compareSOrcaBuilds(right.version, left.version))
}

export async function listSOrcaReleaseBuilds(): Promise<SOrcaReleaseBuild[]> {
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
