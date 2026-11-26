// The dispatch API a build's preload actually offers. The preload type assumes it, but an older
// packaged desktop can lack it, so presence is checked at runtime and the panel states the limit.
export type CnbDispatchApiLike = {
  getTaskDispatch?: unknown
  startTaskDispatch?: unknown
}

export function hasCnbTaskDispatchApi(api: CnbDispatchApiLike | undefined): boolean {
  return typeof api?.getTaskDispatch === 'function' && typeof api.startTaskDispatch === 'function'
}
