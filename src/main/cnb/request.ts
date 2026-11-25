const CNB_API = 'https://api.cnb.cool'

export async function cnbRequest(
  path: string,
  token: string,
  query?: Record<string, string>
): Promise<Response> {
  const url = new URL(path, CNB_API)
  if (url.origin !== CNB_API || url.pathname !== path) {
    throw new Error('Invalid CNB API path.')
  }
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value)
  }
  return fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000)
  })
}
