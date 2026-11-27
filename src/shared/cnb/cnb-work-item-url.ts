export function decodeCnbRepositoryPath(path: string): string | null {
  try {
    const parts = path.split('/').map(decodeURIComponent)
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

export function parseCnbWorkItemUrl(
  value: string
): { repository: string; type: 'issue' | 'pr'; number: number } | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (
    !['https://cnb.cool', 'http://cnb.cool'].includes(url.origin) ||
    url.username ||
    url.password
  ) {
    return null
  }
  const match = /^\/(.+)\/-\/(issues|pulls)\/(\d+)\/?$/.exec(url.pathname)
  if (!match) {
    return null
  }
  const repository = decodeCnbRepositoryPath(match[1])
  const number = Number(match[3])
  return repository && Number.isSafeInteger(number) && number > 0
    ? { repository, type: match[2] === 'issues' ? 'issue' : 'pr', number }
    : null
}
