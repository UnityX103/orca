import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, createReadStream, existsSync, openSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
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

const repo = fileURLToPath(new URL('../../../..', import.meta.url))
const systemApp = '/Applications/Orca.app'
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
const signingIdentityPath = join(sorcaDevelopmentDirectory, 'signing-identity')

function isOrcaRunning() {
  return execFileSync('/bin/ps', ['-ax', '-o', 'comm='], { encoding: 'utf8' })
    .split('\n')
    .some((command) => appExecutables.has(command.trim()))
}

function run(program, args, env = process.env) {
  execFileSync(program, args, { cwd: repo, env, stdio: 'inherit' })
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
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(builtImage)) {
      hash.update(chunk)
    }
    const metadata = {
      version,
      path: image,
      size: (await stat(builtImage)).size,
      sha256: hash.digest('hex')
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
}

async function installOrQueue(metadata, installedVersion) {
  const staged = await stageSOrcaMacPackage({
    source: metadata.path,
    target: app,
    installedVersion,
    expected: metadata,
    signal: AbortSignal.timeout(240_000)
  })
  if (!isOrcaRunning()) {
    await installDevelopmentPackage(staged, installedVersion)
    return
  }
  const log = openSync(logPath, 'a', 0o600)
  try {
    const worker = spawn(
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
  console.log(`Orca is running. ${staged.version} will install after it quits.`)
  console.log(`Installation log: ${logPath}`)
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Orca development installation requires an Apple Silicon Mac')
  }
  const [command, payload, currentVersion] = process.argv.slice(2)
  if (command === '--apply-staged') {
    const staged = JSON.parse(payload)
    if (
      staged.target !== app ||
      dirname(staged.root) !== dirname(app) ||
      !/^\.sorca-update-[A-Za-z0-9]+$/.test(basename(staged.root))
    ) {
      throw new Error('The Orca installation location changed')
    }
    await installDevelopmentPackage(staged, currentVersion)
    return
  }
  if (command !== '--package' && command !== '--install') {
    throw new Error('Use pnpm orca:dev:package or pnpm orca:dev:install')
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
