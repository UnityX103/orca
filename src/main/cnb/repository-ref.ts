import { createRemoteRefProbeCache } from '../git/remotes/remote-ref-probe-cache'
import type { RemoteRefLocalGitOptions } from '../git/remotes/remote-ref-probe-cache'

export function parseCnbRemote(remote: string): string | null {
  const value = remote.trim()
  if (/(?:\/|:)(?:\.|%2e){1,2}(?:\/|$)/i.test(value) || value.includes('\\')) {
    return null
  }
  const scp = /^(?:[^@/:\s]+@)?cnb\.cool:(.+)$/i.exec(value)
  let pathname: string
  if (scp) {
    pathname = scp[1]
  } else {
    try {
      const url = new URL(value)
      if (url.hostname !== 'cnb.cool' || !['https:', 'ssh:', 'git+ssh:'].includes(url.protocol)) {
        return null
      }
      pathname = url.pathname
    } catch {
      return null
    }
  }
  try {
    const parts = pathname
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.git$/i, '')
      .split('/')
      .map(decodeURIComponent)
    if (
      parts.length < 2 ||
      parts.some((part) => part === '.' || part === '..' || !/^[\p{L}\p{N}_.-]+$/u.test(part))
    ) {
      return null
    }
    return parts.join('/')
  } catch {
    return null
  }
}

const repoRefCache = createRemoteRefProbeCache(parseCnbRemote)

export function getCnbRepoRef(
  repoPath: string,
  connectionId: string | null,
  options?: RemoteRefLocalGitOptions
): Promise<string | null> {
  return repoRefCache.get(repoPath, 'origin', connectionId, options)
}

export function cnbRepositoryPath(repository: string): string {
  return `/${repository.split('/').map(encodeURIComponent).join('/')}/-`
}

export function cnbRepositoryUrl(repository: string): string {
  return `https://cnb.cool${cnbRepositoryPath(repository).slice(0, -2)}`
}

export function parseCnbReviewUrl(value: string): { repository: string; number: number } | null {
  const match = /^https:\/\/cnb\.cool\/(.+)\/-\/pulls\/([1-9]\d*)\/?$/.exec(value)
  if (!match || /[?#]/.test(match[1])) {
    return null
  }
  const repository = parseCnbRemote(`https://cnb.cool/${match[1]}`)
  const number = Number(match[2])
  return repository && Number.isSafeInteger(number) ? { repository, number } : null
}
