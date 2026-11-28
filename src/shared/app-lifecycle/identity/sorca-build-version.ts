export const SORCA_RELEASE_VERSION = /^\d+\.\d+\.\d+\+(?:build|sorca)\.(\d{1,15})\.(\d{1,8})$/
export const SORCA_DEVELOPMENT_VERSION = /^\d+\.\d+\.\d+\+(?:local|sorca\.native)\.(\d{1,15})$/

export function isSOrcaVersion(version: string): boolean {
  return SORCA_RELEASE_VERSION.test(version) || SORCA_DEVELOPMENT_VERSION.test(version)
}

export function defaultsToSOrcaAutoUpdate(version: string | null, platform: string): boolean {
  return (
    (platform === 'darwin' || platform === 'win32') &&
    version !== null &&
    SORCA_RELEASE_VERSION.test(version)
  )
}
