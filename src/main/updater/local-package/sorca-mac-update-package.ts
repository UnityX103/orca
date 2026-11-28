import { runProcess } from '@orca/process-host'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdtemp, rename, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { type Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { compareAppVersions } from '../../../shared/app-lifecycle/identity/app-version'
import {
  SORCA_DEVELOPMENT_VERSION,
  SORCA_RELEASE_VERSION
} from '../../../shared/app-lifecycle/identity/sorca-build-version'
import { compareSOrcaBuilds } from '../releases/sorca-build-order'
import type { SOrcaLocalUpdateError } from '../../../shared/updater/sorca-local-update'
import { readSOrcaMacSigningIdentity, sameSOrcaMacSigningIdentity } from './sorca-mac-signing'
import { swapMacAppBundles } from '../mac-install/macos-bundle-swap'

const APP_NAME = 'Orca.app'
const BUNDLE_IDENTIFIER = 'com.stablyai.orca'

export type StagedSOrcaPackage = {
  root: string
  target: string
  version: string
  signingIdentity?: string[]
}

type PackageMetadata = { version: string; size: number; sha256: string }
type PackageSource =
  | string
  | { open: () => Promise<Readable>; onProgress: (percent: number) => void }

export class SOrcaPackageError extends Error {
  constructor(readonly reason: SOrcaLocalUpdateError) {
    super(reason)
  }
}

export function getSOrcaAppBundle(executable: string): string | null {
  const bundle = dirname(dirname(dirname(executable)))
  return extname(bundle).toLowerCase() === '.app' &&
    basename(executable) === 'Orca' &&
    executable === resolve(bundle, 'Contents', 'MacOS', 'Orca')
    ? bundle
    : null
}

async function macCommand(
  executable: string,
  args: string[],
  signal?: AbortSignal,
  timeoutMs = 120_000
): Promise<string> {
  const result = await runProcess({ program: executable, args, signal, timeoutMs })
  signal?.throwIfAborted()
  if (result.code !== 0) {
    throw new Error(`${basename(executable)} failed: ${result.stderr.trim()}`)
  }
  return result.stdout
}

async function copyVerifiedPackage(
  source: PackageSource,
  destination: string,
  expected: PackageMetadata,
  signal: AbortSignal
): Promise<void> {
  if (typeof source === 'string') {
    const stat = await lstat(source)
    if (!stat.isFile() || extname(source).toLowerCase() !== '.dmg' || stat.size !== expected.size) {
      throw new SOrcaPackageError('invalid-package')
    }
  }
  const hash = createHash('sha256')
  let copiedBytes = 0
  let lastPercent = 0
  const countAndHash = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      copiedBytes += chunk.length
      if (copiedBytes > expected.size) {
        callback(new SOrcaPackageError('invalid-package'))
        return
      }
      hash.update(chunk)
      if (typeof source !== 'string') {
        const percent = Math.min(99, Math.floor((copiedBytes / expected.size) * 100))
        if (percent !== lastPercent) {
          lastPercent = percent
          source.onProgress(percent)
        }
      }
      callback(null, chunk)
    }
  })
  await pipeline(
    typeof source === 'string' ? createReadStream(source) : await source.open(),
    countAndHash,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    { signal }
  )
  const digest = hash.digest('hex')
  if (digest !== expected.sha256 || copiedBytes !== expected.size) {
    throw new SOrcaPackageError('invalid-package')
  }
}

async function readBundleField(
  bundle: string,
  field: string,
  signal?: AbortSignal
): Promise<string> {
  return (
    await macCommand(
      '/usr/libexec/PlistBuddy',
      ['-c', `Print :${field}`, join(bundle, 'Contents', 'Info.plist')],
      signal,
      5_000
    )
  ).trim()
}

function macVersionAsSemver(version: string): string {
  if (/^\d+\.\d+$/.test(version)) {
    return `${version}.0`
  }
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    return version
  }
  throw new SOrcaPackageError('system-version')
}

export async function readInstalledSOrcaVersion(target: string): Promise<string> {
  if (
    !(await lstat(target)).isDirectory() ||
    (await readBundleField(target, 'CFBundleIdentifier')) !== BUNDLE_IDENTIFIER ||
    (await readBundleField(target, 'CFBundleExecutable')) !== 'Orca'
  ) {
    throw new Error('The installation directory does not contain Orca')
  }
  return readBundleField(target, 'CFBundleVersion')
}

async function stageAppFromDiskImage(
  image: string,
  bundle: string,
  signal: AbortSignal
): Promise<void> {
  const volume = await mkdtemp(join(tmpdir(), 'orca-update-volume-'))
  try {
    await macCommand(
      '/usr/bin/hdiutil',
      ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', volume, image],
      signal
    )
    await macCommand('/usr/bin/ditto', [join(volume, APP_NAME), bundle], signal)
  } finally {
    await macCommand('/usr/bin/hdiutil', ['detach', volume], undefined, 10_000).catch(() =>
      macCommand('/usr/bin/hdiutil', ['detach', '-force', volume], undefined, 10_000).catch(
        () => undefined
      )
    )
    await rmdir(volume).catch(() => undefined)
  }
}

export async function discardStagedSOrcaPackage(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true })
}

export async function stageSOrcaMacPackage(args: {
  source: PackageSource
  target: string
  installedVersion: string
  expected: PackageMetadata
  signal: AbortSignal
}): Promise<StagedSOrcaPackage> {
  const { source, target, installedVersion, expected, signal } = args
  const { version } = expected
  const fromRelease = typeof source !== 'string'
  if (fromRelease) {
    if (
      !SORCA_RELEASE_VERSION.test(version) ||
      compareSOrcaBuilds(version, installedVersion) <= 0
    ) {
      throw new SOrcaPackageError('already-installed')
    }
  } else {
    const installedDevBuild = SORCA_DEVELOPMENT_VERSION.exec(installedVersion)
    const selectedDevBuild = SORCA_DEVELOPMENT_VERSION.exec(version)
    if (
      !selectedDevBuild ||
      (installedDevBuild && Number(selectedDevBuild[1]) <= Number(installedDevBuild[1]))
    ) {
      throw new SOrcaPackageError('already-installed')
    }
  }
  const signingIdentity = fromRelease ? await requireSigningIdentity(target, signal) : undefined
  const root = await mkdtemp(join(dirname(target), '.sorca-update-')).catch(() => {
    throw new SOrcaPackageError('install-location')
  })
  const image = join(root, 'package.dmg')
  const staged = join(root, APP_NAME)
  try {
    await copyVerifiedPackage(source, image, expected, signal)
    await stageAppFromDiskImage(image, staged, signal)
    const [identifier, executable, shortVersion, buildVersion] = await Promise.all([
      readBundleField(staged, 'CFBundleIdentifier', signal),
      readBundleField(staged, 'CFBundleExecutable', signal),
      readBundleField(staged, 'CFBundleShortVersionString', signal),
      readBundleField(staged, 'CFBundleVersion', signal)
    ])
    if (
      identifier !== BUNDLE_IDENTIFIER ||
      executable !== 'Orca' ||
      shortVersion !== version ||
      buildVersion !== version
    ) {
      throw new SOrcaPackageError('invalid-package')
    }
    if (signingIdentity) {
      const minimumSystemVersion = await readBundleField(staged, 'LSMinimumSystemVersion', signal)
      const systemVersion = (
        await macCommand('/usr/bin/sw_vers', ['-productVersion'], signal)
      ).trim()
      if (
        compareAppVersions(
          macVersionAsSemver(systemVersion),
          macVersionAsSemver(minimumSystemVersion)
        ) < 0
      ) {
        throw new SOrcaPackageError('system-version')
      }
      await requireSameSigningIdentity(staged, signingIdentity, signal)
    } else {
      await macCommand('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged], signal)
    }
    await rm(image)
    return { root, target, version, signingIdentity }
  } catch (error) {
    await discardStagedSOrcaPackage(root).catch(console.warn)
    throw error
  }
}

async function requireSigningIdentity(bundle: string, signal?: AbortSignal): Promise<string[]> {
  try {
    return await readSOrcaMacSigningIdentity(bundle, signal)
  } catch {
    signal?.throwIfAborted()
    throw new SOrcaPackageError('signing-identity')
  }
}

async function requireSameSigningIdentity(
  bundle: string,
  identity: readonly string[],
  signal?: AbortSignal
): Promise<void> {
  if (!sameSOrcaMacSigningIdentity(identity, await requireSigningIdentity(bundle, signal))) {
    throw new SOrcaPackageError('signing-identity')
  }
}

export async function installStagedSOrcaPackage(
  packageToInstall: StagedSOrcaPackage,
  installedVersion: string,
  canReplace?: () => Promise<boolean>
): Promise<boolean> {
  const { root, target, version, signingIdentity } = packageToInstall
  const staged = join(root, APP_NAME)
  try {
    if (signingIdentity) {
      await Promise.all([
        requireSameSigningIdentity(target, signingIdentity),
        requireSameSigningIdentity(staged, signingIdentity)
      ])
    }
    if ((await readInstalledSOrcaVersion(target)) !== installedVersion) {
      throw new Error('The installed Orca bundle changed after staging')
    }
    if ((await readBundleField(staged, 'CFBundleVersion')) !== version) {
      throw new Error('The staged Orca bundle changed after verification')
    }
    if (canReplace && !(await canReplace())) {
      return false
    }
    if (signingIdentity) {
      await swapMacAppBundles(staged, target)
    } else {
      await replaceDevelopmentBundle(staged, target, root)
      await discardStagedSOrcaPackage(root).catch(console.warn)
    }
    return true
  } finally {
    if (signingIdentity) {
      await discardStagedSOrcaPackage(root).catch(console.warn)
    }
  }
}

async function replaceDevelopmentBundle(
  staged: string,
  target: string,
  root: string
): Promise<void> {
  const backup = join(root, 'Previous.app')
  await rename(target, backup)
  try {
    await rename(staged, target)
  } catch (error) {
    await rename(backup, target).catch((restoreError: unknown) => {
      throw new AggregateError([error, restoreError], `Previous Orca bundle: ${backup}`)
    })
    throw error
  }
}
