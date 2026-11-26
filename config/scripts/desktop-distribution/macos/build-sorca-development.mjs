import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, createReadStream, existsSync, openSync } from 'node:fs'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  writeFile
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import distribution from '../../../orca-distribution.cjs'
import {
  readSOrcaDevelopmentPackage,
  sorcaDevelopmentDirectory,
  sorcaDevelopmentManifest
} from '../../../../src/main/updater/local-package/sorca-development-manifest.ts'
import {
  discardStagedSOrcaPackage,
  installStagedSOrcaPackage,
  readInstalledSOrcaVersion,
  stageSOrcaMacPackage
} from '../../../../src/main/updater/local-package/sorca-mac-update-package.ts'
import { getRunningMacAppPid, requestMacAppQuit } from './request-mac-app-quit.mjs'

const repo = fileURLToPath(new URL('../../../..', import.meta.url))
const systemApp = '/Applications/Orca.app'
const bundleIdentifier = 'com.stablyai.orca'
const app = resolve(
  process.env.ORCA_APP_PATH ||
    process.env.SORCA_APP_PATH ||
    (existsSync(systemApp) ? systemApp : join(homedir(), 'Applications', 'Orca.app'))
)
const appExecutables = new Set([
  join(app, 'Contents', 'MacOS', 'Orca'),
  '/Applications/SOrca.app/Contents/MacOS/SOrca',
  join(homedir(), 'Applications', 'SOrca.app', 'Contents', 'MacOS', 'SOrca')
])
const { macInstaller: artifactName, buildBaseVersion } = distribution
const logPath = join(sorcaDevelopmentDirectory, 'install.log')
const installLockPath = join(sorcaDevelopmentDirectory, 'install.lock')
const signingIdentityPath = join(sorcaDevelopmentDirectory, 'signing-identity')

function isOrcaRunning() {
  return execFileSync('/bin/ps', ['-ax', '-o', 'comm='], { encoding: 'utf8' })
    .split('\n')
    .some((command) => appExecutables.has(command.trim()))
}

function run(program, args, env = process.env) {
  execFileSync(program, args, { cwd: repo, env, stdio: 'inherit' })
}

async function fileSha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

async function getSigningIdentity() {
  const output = execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8'
  })
  const available = new Set(
    Array.from(
      output.matchAll(/^\s*\d+\)\s+([A-F0-9]{40}) "Apple Development:/gm),
      (match) => match[1]
    )
  )
  let pinned = await readFile(signingIdentityPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return ''
  })
  if (!pinned) {
    const selected = process.env.SORCA_MAC_LOCAL_SIGNING_IDENTITY?.trim().toUpperCase()
    const identity = selected || (available.size === 1 ? [...available][0] : undefined)
    if (!identity || !available.has(identity)) {
      throw new Error(
        'Select a valid Apple Development certificate with SORCA_MAC_LOCAL_SIGNING_IDENTITY.'
      )
    }
    try {
      await writeFile(signingIdentityPath, `${identity}\n`, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error
      }
    }
    pinned = await readFile(signingIdentityPath, 'utf8')
  }
  const identity = pinned.trim()
  if (!available.has(identity)) {
    throw new Error(
      `The Apple Development certificate pinned in ${signingIdentityPath} is unavailable.`
    )
  }
  return identity
}

async function createDevelopmentPackage(installedVersion) {
  const signingIdentity = await getSigningIdentity()
  const packageVersion = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).version
  const version = `${buildBaseVersion(packageVersion, installedVersion)}+local.${Date.now()}`
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
  const env = {
    ...process.env,
    ORCA_LOCAL_BUILD_VERSION: version,
    ORCA_BUILD_COMMIT: commit,
    SORCA_WINDOWS_QA: '0',
    SORCA_MAC_LOCAL_SIGNING_IDENTITY: signingIdentity
  }
  const output = await mkdtemp(join(sorcaDevelopmentDirectory, 'build-'))
  const manifest = join(output, 'latest.json')
  const packageDirectory = join(sorcaDevelopmentDirectory, 'packages', version)
  const image = join(packageDirectory, artifactName)
  const builtImage = join(output, artifactName)
  try {
    run('pnpm', ['run', 'build:release'], env)
    run('pnpm', ['run', 'ensure:electron-runtime'], env)
    run(
      'pnpm',
      [
        'exec',
        'electron-builder',
        '--config',
        'config/electron-builder.orca-distribution.config.cjs',
        '--mac',
        'dmg',
        '--arm64',
        '--publish',
        'never',
        `--config.directories.output=${output}`
      ],
      env
    )
    const packagedApp = join(output, 'mac-arm64', 'Orca.app')
    if ((await readInstalledSOrcaVersion(packagedApp)) !== version) {
      throw new Error('The packaged bundle does not have the development version')
    }
    const requirement = `=identifier "com.stablyai.orca" and anchor apple generic and certificate leaf = H"${signingIdentity}"`
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', requirement, packagedApp])
    const terminalHost = join(packagedApp, 'Contents', 'Helpers', 'Orca Agents.app')
    run('/usr/bin/codesign', ['--verify', '--strict', '-R', requirement, terminalHost])
    const metadata = {
      version,
      path: image,
      size: (await stat(builtImage)).size,
      sha256: await fileSha256(builtImage)
    }
    await writeFile(manifest, `${JSON.stringify(metadata)}\n`, { mode: 0o600 })
    await mkdir(packageDirectory, { recursive: true, mode: 0o700 })
    await rename(builtImage, image)
    await rename(manifest, sorcaDevelopmentManifest)
    console.log(`Built ${image}`)
    return metadata
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}

async function installDevelopmentPackage(staged, installedVersion) {
  while (isOrcaRunning()) {
    await delay(1000)
  }
  await mkdir(installLockPath, { mode: 0o700 })
  try {
    if ((await readSOrcaDevelopmentPackage())?.version !== staged.version) {
      await discardStagedSOrcaPackage(staged.root)
      console.log(`Skipped ${staged.version} because a newer package was built.`)
      return
    }
    if ((await readInstalledSOrcaVersion(app)) === staged.version) {
      await discardStagedSOrcaPackage(staged.root)
      console.log(`${staged.version} is already installed.`)
      return
    }
    await installStagedSOrcaPackage(staged, installedVersion)
    console.log(`Installed ${staged.version} in ${app}`)
    const backgroundEnvironment =
      process.env.ORCA_BACKGROUND_LAUNCH === '1' ? ['--env', 'ORCA_BACKGROUND_LAUNCH=1'] : []
    run('/usr/bin/open', ['-g', '-n', ...backgroundEnvironment, app])
  } finally {
    await rmdir(installLockPath)
  }
}

async function installOrQueue(
  metadata,
  installedVersion,
  { queueOnly = false, source = metadata.path } = {}
) {
  if (queueOnly && !isOrcaRunning()) {
    throw new Error('Start Orca before queuing a local update.')
  }
  const staged = await stageSOrcaMacPackage({
    source,
    target: app,
    installedVersion,
    expected: metadata,
    signal: AbortSignal.timeout(240_000)
  })
  if (!isOrcaRunning()) {
    if (queueOnly) {
      await discardStagedSOrcaPackage(staged.root)
      throw new Error('Orca quit while the package was being prepared. Start it and try again.')
    }
    await installDevelopmentPackage(staged, installedVersion)
    return
  }
  let worker
  try {
    const log = openSync(logPath, 'a', 0o600)
    try {
      worker = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          import.meta.filename,
          '--apply-staged',
          JSON.stringify(staged),
          installedVersion
        ],
        { cwd: repo, detached: true, stdio: ['ignore', log, log] }
      )
      await new Promise((ready, reject) => {
        worker.once('spawn', ready)
        worker.once('error', reject)
      })
      worker.unref()
    } finally {
      closeSync(log)
    }
  } catch (error) {
    if (!worker?.pid) {
      await discardStagedSOrcaPackage(staged.root).catch(console.warn)
    }
    throw error
  }
  console.log(`Orca is running. ${staged.version} will install after it quits.`)
  console.log(`Waiting installer PID: ${worker.pid}`)
  console.log(`Installation log: ${logPath}`)
  return worker.pid
}

function isStagedForTarget(staged) {
  return (
    staged?.target === app &&
    typeof staged.root === 'string' &&
    dirname(staged.root) === dirname(app) &&
    /^\.sorca-update-[A-Za-z0-9]+$/.test(basename(staged.root))
  )
}

function findQueuedInstaller() {
  const marker = ` --import tsx ${import.meta.filename} --apply-staged `
  const processes = execFileSync('/bin/ps', ['-axww', '-o', 'uid=,pid=,args='], {
    encoding: 'utf8'
  })
  const eligible = processes.split('\n').flatMap((line) => {
    const fields = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
    if (!fields || Number(fields[1]) !== process.getuid()) {
      return []
    }
    const [, , pid, command] = fields
    const index = command.indexOf(marker)
    if (index === -1 || basename(command.slice(0, index)) !== 'node') {
      return []
    }
    const payload = command.slice(index + marker.length)
    const jsonEnd = payload.lastIndexOf('}') + 1
    try {
      const staged = JSON.parse(payload.slice(0, jsonEnd))
      return isStagedForTarget(staged)
        ? [{ pid: Number(pid), staged, installedVersion: payload.slice(jsonEnd).trim() }]
        : []
    } catch {
      return []
    }
  })
  if (eligible.length > 1) {
    throw new Error('More than one Orca installer is queued. Inspect the installation log.')
  }
  return eligible[0]
}

async function installPackageAndRestart(source, metadata, installedVersion) {
  const details = await lstat(source)
  if (
    !details.isFile() ||
    extname(source).toLowerCase() !== '.dmg' ||
    details.size !== metadata.size ||
    (await fileSha256(source)) !== metadata.sha256
  ) {
    throw new Error('The DMG does not match the development package registered on this Mac.')
  }
  if (installedVersion === metadata.version) {
    console.log(`${metadata.version} is already installed.`)
    return
  }
  const originalPid = isOrcaRunning() ? getRunningMacAppPid(bundleIdentifier, app) : null
  const queued = findQueuedInstaller()
  if (queued) {
    const stagedApp = join(queued.staged.root, 'Orca.app')
    if (
      queued.staged.version !== metadata.version ||
      queued.installedVersion !== installedVersion ||
      (await readInstalledSOrcaVersion(stagedApp)) !== metadata.version
    ) {
      throw new Error('Orca already has a different update queued.')
    }
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagedApp])
    console.log(`Reusing waiting installer PID: ${queued.pid}`)
  } else {
    const waitingPid = await installOrQueue(metadata, installedVersion, { source })
    if (!waitingPid) {
      return
    }
  }
  if (isOrcaRunning()) {
    const pid = originalPid ?? getRunningMacAppPid(bundleIdentifier, app)
    requestMacAppQuit(bundleIdentifier, app, pid)
    console.log(`Requested normal quit of Orca PID ${pid} to install ${metadata.version}.`)
  }
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Orca development installation requires an Apple Silicon Mac')
  }
  const [command, payload, currentVersion] = process.argv.slice(2)
  if (command === '--apply-staged') {
    const staged = JSON.parse(payload)
    if (!isStagedForTarget(staged)) {
      throw new Error('The Orca installation location changed')
    }
    await installDevelopmentPackage(staged, currentVersion)
    return
  }
  if (command === '--install-package') {
    const metadata = await readSOrcaDevelopmentPackage()
    if (!metadata || !payload) {
      throw new Error('Pass the path to the development DMG registered on this Mac.')
    }
    const installedVersion = await readInstalledSOrcaVersion(app)
    await installPackageAndRestart(resolve(payload), metadata, installedVersion)
    return
  }
  if (command === '--queue-package') {
    const metadata = await readSOrcaDevelopmentPackage()
    if (!metadata || metadata.version !== payload) {
      throw new Error(
        'The requested version does not match the development package registered on this Mac.'
      )
    }
    const installedVersion = await readInstalledSOrcaVersion(app)
    await installOrQueue(metadata, installedVersion, { queueOnly: true })
    return
  }
  if (command !== '--package' && command !== '--install') {
    throw new Error('Use scripts/update-orca-dev --help for local update options.')
  }
  const installedVersion = await readInstalledSOrcaVersion(app)
  await mkdir(sorcaDevelopmentDirectory, { recursive: true, mode: 0o700 })
  const metadata = await createDevelopmentPackage(installedVersion)
  if (command === '--install') {
    await installOrQueue(metadata, installedVersion)
  }
}

await main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
