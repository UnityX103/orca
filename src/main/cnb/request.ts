const CNB_API = 'https://api.cnb.cool'
// JSON negotiates the vendor media type; the proven working header keeps older endpoints stable.
const CNB_ACCEPT = 'application/json'

export type CnbRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  timeoutMs?: number
}

export async function cnbRequest(
  path: string,
  token: string,
  query?: Record<string, string>,
  options: CnbRequestOptions = {}
): Promise<Response> {
  const url = new URL(path, CNB_API)
  if (url.origin !== CNB_API || url.pathname !== path) {
    throw new Error('Invalid CNB API path.')
  }
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value)
  }
  const method = options.method ?? 'GET'
  return fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: CNB_ACCEPT,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs ?? 8_000)
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

export function cnbPageCount(response: Response, pageSize: number): number | null {
  const total = response.headers.get('x-cnb-total')
  if (total === null) {
    return null
  }
  const parsed = Number(total)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null
  }
  const served = Number(response.headers.get('x-cnb-page-size')) || pageSize
  return Math.max(1, Math.ceil(parsed / served))
}

export async function discardCnbBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {})
}
