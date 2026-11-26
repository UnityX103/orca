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

export function cnbHasNextPage(
  response: Response,
  page: number,
  pageSize: number,
  rowCount: number
): boolean {
  const total = response.headers.get('x-cnb-total')
  const served = Number(response.headers.get('x-cnb-page-size')) || pageSize
  return rowCount > 0 && (total === null ? rowCount >= served : page * served < Number(total))
}
