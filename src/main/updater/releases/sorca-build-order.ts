import { compareAppVersions } from '../../../shared/app-lifecycle/identity/app-version'
import { SORCA_RELEASE_VERSION } from '../../../shared/app-lifecycle/identity/sorca-build-version'

function buildOrder(version: string): { run: number; attempt: number } {
  const match = SORCA_RELEASE_VERSION.exec(version)
  return { run: Number(match?.[1] ?? 0), attempt: Number(match?.[2] ?? 0) }
}

export function compareSOrcaBuilds(left: string, right: string): number {
  const a = buildOrder(left)
  const b = buildOrder(right)
  return compareAppVersions(left, right) || a.run - b.run || a.attempt - b.attempt
}
