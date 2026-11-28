import { spawnProcess } from '@orca/process-host'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { win32 as paths } from 'node:path'
import { hasDedicatedOrcaInstallLayout } from '../lifecycle/windows-update-install-directory'
import { compareSOrcaBuilds } from '../releases/sorca-build-order'
import {
  copyVerifiedPackage,
  SOrcaPackageError,
  type SOrcaPackageDigest,
  type SOrcaPackageSource
} from './sorca-verified-package'

const RESULT_FILE = 'sorca-update-result.txt'
const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000

function windowsUpdateCache(userDataPath: string): string {
  const profile = createHash('sha256')
    .update(paths.resolve(userDataPath).toLowerCase())
    .digest('hex')
  return paths.join(tmpdir(), `sorca-updates-${profile.slice(0, 24)}`)
}

export async function clearCompletedSOrcaWindowsUpdates(userDataPath: string): Promise<void> {
  const cache = windowsUpdateCache(userDataPath)
  if (!(await lstat(cache).catch(() => null))?.isDirectory()) {
    return
  }
  for (const entry of await readdir(cache, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^attempt-[a-zA-Z0-9]{6}$/.test(entry.name)) {
      continue
    }
    const root = paths.join(cache, entry.name)
    const resultFile = paths.join(root, RESULT_FILE)
    const resultInfo = await lstat(resultFile).catch(() => null)
    const outcome =
      resultInfo?.isFile() && resultInfo.size <= 64
        ? (await readFile(resultFile, 'utf8').catch(() => '')).trim()
        : ''
    const expired = Date.now() - (await lstat(root)).mtimeMs >= STAGING_MAX_AGE_MS
    if (outcome || expired) {
      await discardSOrcaWindowsPackage(root)
        .then(() =>
          console.info(
            '[sorca-update] Finished Windows installation attempt:',
            outcome || 'expired'
          )
        )
        .catch(console.warn)
    }
  }
}

export type StagedSOrcaWindowsPackage = {
  root: string
  installer: string
  version: string
  target: string
  expected: SOrcaPackageDigest
}

export async function sorcaWindowsInstallDirectory(executable: string): Promise<string> {
  const localAppData = process.env.LOCALAPPDATA
  // Only the ordinary per-user installer layout is eligible for silent use without elevation.
  if (
    process.platform !== 'win32' ||
    process.arch !== 'x64' ||
    !localAppData ||
    !paths.isAbsolute(localAppData)
  ) {
    throw new SOrcaPackageError('install-location')
  }
  const target = paths.join(localAppData, 'Programs', 'orca')
  if (
    paths.join(target, 'Orca.exe').toLowerCase() !== executable.toLowerCase() ||
    (await realpath(target)).toLowerCase() !== target.toLowerCase() ||
    !hasDedicatedOrcaInstallLayout(await readdir(target, { withFileTypes: true }))
  ) {
    throw new SOrcaPackageError('install-location')
  }
  return target
}

export async function stageSOrcaWindowsPackage(options: {
  source: Exclude<SOrcaPackageSource, string>
  executable: string
  userDataPath: string
  version: string
  expected: SOrcaPackageDigest
  signal: AbortSignal
}): Promise<StagedSOrcaWindowsPackage> {
  const { source, executable, userDataPath, expected, version, signal } = options
  const target = await sorcaWindowsInstallDirectory(executable)
  const cache = windowsUpdateCache(userDataPath)
  await mkdir(cache, { recursive: true })
  if (!(await lstat(cache)).isDirectory()) {
    throw new SOrcaPackageError('install-location')
  }
  const root = await mkdtemp(paths.join(cache, 'attempt-'))
  const installer = paths.join(root, 'orca-windows-setup.exe')
  try {
    await copyVerifiedPackage(source, installer, expected, signal)
    return { root, installer, target, expected, version }
  } catch (error) {
    await discardSOrcaWindowsPackage(root).catch(console.warn)
    throw error
  }
}

export function discardSOrcaWindowsPackage(root: string): Promise<void> {
  return rm(root, { recursive: true, force: true })
}

async function verifyInstaller({ installer, expected }: StagedSOrcaWindowsPackage): Promise<void> {
  const entry = await lstat(installer)
  if (!entry.isFile() || entry.size !== expected.size) {
    throw new SOrcaPackageError('invalid-package')
  }
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(installer, { signal: AbortSignal.timeout(30_000) })) {
    hash.update(chunk)
  }
  if (hash.digest('hex') !== expected.sha256) {
    throw new SOrcaPackageError('invalid-package')
  }
}

export async function applySOrcaWindowsPackage(
  staged: StagedSOrcaWindowsPackage,
  executable: string,
  installedVersion: string,
  restart: boolean,
  canInstall: () => boolean
): Promise<ChildProcess | undefined> {
  let handedOff = false
  try {
    if (!canInstall() || compareSOrcaBuilds(staged.version, installedVersion) <= 0) {
      return
    }
    await verifyInstaller(staged)
    if ((await sorcaWindowsInstallDirectory(executable)) !== staged.target || !canInstall()) {
      return
    }
    const args = ['--updated', '/S', '--orca-deferred-update']
    if (restart) {
      args.push('--force-run')
    }
    const installer = spawnProcess({
      program: staged.installer,
      args,
      env: { ...process.env, ORCA_SORCA_EXPECTED_INSTALL_DIRECTORY: staged.target },
      detached: true,
      stdio: 'ignore'
    })
    await new Promise<void>((resolve, reject) => {
      installer.once('spawn', resolve)
      installer.once('error', reject)
    })
    handedOff = true
    installer.unref()
    return installer
  } finally {
    if (!handedOff) {
      await discardSOrcaWindowsPackage(staged.root).catch(console.warn)
    }
  }
}
