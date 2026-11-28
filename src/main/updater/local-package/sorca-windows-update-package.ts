import { spawnProcess } from '@orca/process-host'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
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
  version: string
  expected: SOrcaPackageDigest
  signal: AbortSignal
}): Promise<StagedSOrcaWindowsPackage> {
  const { source, executable, expected, version, signal } = options
  const target = await sorcaWindowsInstallDirectory(executable)
  const root = await mkdtemp(paths.join(tmpdir(), 'orca-update-'))
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
