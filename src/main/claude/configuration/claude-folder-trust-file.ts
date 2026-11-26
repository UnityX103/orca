import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, lstat, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, posix, resolve, win32 } from 'node:path'
import { homedir } from 'node:os'
import '../../filesystem/atomic-file-publication'
import { renameFileWithWindowsRetryAsync } from '../../../shared/file-write/windows-retry-file-operations'
import { lockClaudeConfig, runSerializedForClaudeConfig } from './claude-global-config-lock'
import { parseWslUncPath } from '../../../shared/file-access/wsl-paths'
import { runWslProcess } from '../../wsl/execution/wsl-runner'
import type { ClaudeRuntimeAuthPreparation } from '../../claude-accounts/runtime-auth/runtime-auth-types'

export type ClaudeTrustPathStyle = 'posix' | 'win32'

export type ClaudeFolderTrustOutcome =
  | 'granted'
  | 'unchanged'
  | 'missing-config'
  | 'locked'
  | 'unreadable'

type ClaudeConfigEnv = {
  CLAUDE_CONFIG_DIR?: string
  CLAUDE_CODE_CUSTOM_OAUTH_URL?: string
}

function pathApi(style: ClaudeTrustPathStyle): typeof posix {
  return style === 'win32' ? win32 : posix
}

/** Claude looks up NFC `path.normalize` output, with `/` separators on Windows. */
export function toClaudeTrustKey(folderPath: string, style: ClaudeTrustPathStyle): string {
  const normalized = pathApi(style).normalize(folderPath.normalize('NFC'))
  return style === 'win32' ? normalized.replaceAll('\\', '/') : normalized
}

/** Claude prefers legacy .config.json, then .claude.json under CLAUDE_CONFIG_DIR or home. */
export function resolveClaudeGlobalConfigFile(args: {
  env: ClaudeConfigEnv
  homeDir: string
  style: ClaudeTrustPathStyle
  exists: (filePath: string) => boolean
}): string {
  const { join } = pathApi(args.style)
  const legacyDir = (args.env.CLAUDE_CONFIG_DIR ?? join(args.homeDir, '.claude')).normalize('NFC')
  const legacyFile = join(legacyDir, '.config.json')
  if (args.exists(legacyFile)) {
    return legacyFile
  }
  const suffix = args.env.CLAUDE_CODE_CUSTOM_OAUTH_URL ? '-custom-oauth' : ''
  return join(args.env.CLAUDE_CONFIG_DIR || args.homeDir, `.claude${suffix}.json`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type ClaudeGlobalConfigChange =
  | { kind: 'unchanged' }
  | { kind: 'refuse' }
  | { kind: 'changed'; config: Record<string, unknown> }

export function applyClaudeFolderTrust(
  config: Record<string, unknown>,
  folderKeys: readonly string[]
): ClaudeGlobalConfigChange {
  if (config.projects !== undefined && !isPlainObject(config.projects)) {
    return { kind: 'refuse' }
  }
  const projects: Record<string, unknown> = { ...config.projects }
  const alreadyTrusted = folderKeys.some((key) => {
    const entry = projects[key]
    return isPlainObject(entry) && entry.hasTrustDialogAccepted === true
  })
  if (alreadyTrusted) {
    return { kind: 'unchanged' }
  }
  for (const key of folderKeys) {
    const entry = projects[key]
    projects[key] = isPlainObject(entry)
      ? { ...entry, hasTrustDialogAccepted: true }
      : { hasTrustDialogAccepted: true }
  }
  return { kind: 'changed', config: { ...config, projects } }
}

function isMissingFileError(error: unknown): boolean {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  return code === 'ENOENT' || code === 'ENOTDIR'
}

type ConfigTarget = { kind: 'file'; path: string } | { kind: 'missing' } | { kind: 'unreadable' }

/** Resolve symlinks before replacement so the rename preserves the link. */
async function resolveConfigTarget(configFile: string): Promise<ConfigTarget> {
  try {
    const entry = await lstat(configFile)
    const path = entry.isSymbolicLink() ? await realpath(configFile) : configFile
    return (await stat(path)).isFile() ? { kind: 'file', path } : { kind: 'unreadable' }
  } catch (error) {
    return { kind: isMissingFileError(error) ? 'missing' : 'unreadable' }
  }
}

async function readConfigAt(
  target: ConfigTarget
): Promise<{ path: string; config: Record<string, unknown> } | 'missing-config' | 'unreadable'> {
  if (target.kind === 'missing') {
    return 'missing-config'
  }
  if (target.kind === 'unreadable') {
    return 'unreadable'
  }
  try {
    const config: unknown = JSON.parse(await readFile(target.path, 'utf-8'))
    return isPlainObject(config) ? { path: target.path, config } : 'unreadable'
  } catch {
    return 'unreadable'
  }
}

type ReplacementFile = { target: string; path: string }

/** Prepare the replacement with target permissions before writing config data. */
async function createReplacementFile(target: string): Promise<ReplacementFile> {
  const suffix = `.orca-trust-${randomUUID()}.tmp`
  const path = `${target}${suffix}`
  const guestFile = parseWslUncPath(target)
  try {
    if (guestFile) {
      // Copy modes in the guest: Windows exposes synthetic permissions for WSL UNC files.
      await writeFile(path, '', { flag: 'wx' })
      const copied = await runWslProcess({
        distro: guestFile.distro,
        loginPath: 'none',
        program: 'chmod',
        args: [`--reference=${guestFile.linuxPath}`, '--', `${guestFile.linuxPath}${suffix}`]
      })
      if (copied.code !== 0) {
        throw new Error(`could not copy the guest mode of ${target}: ${copied.stderr.trim()}`)
      }
    } else {
      const mode = (await stat(target)).mode & 0o777
      await writeFile(path, '', { flag: 'wx', mode })
      if (process.platform !== 'win32') {
        // Restore bits narrowed by umask.
        await chmod(path, mode)
      }
    }
  } catch (error) {
    await rm(path, { force: true })
    throw error
  }
  return { target, path }
}

async function replaceConfig(
  replacement: ReplacementFile,
  config: Record<string, unknown>
): Promise<void> {
  // Reuse the prepared file so its permission bits survive.
  await writeFile(replacement.path, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf-8',
    flag: 'r+'
  })
  await renameFileWithWindowsRetryAsync(replacement.path, replacement.target)
}

export async function grantClaudeFolderTrust(args: {
  configFile: string
  folderKeys: readonly string[]
}): Promise<ClaudeFolderTrustOutcome> {
  const outcome = await updateClaudeGlobalConfig(args.configFile, (config) =>
    applyClaudeFolderTrust(config, args.folderKeys)
  )
  return outcome === 'updated' ? 'granted' : outcome
}

export type ClaudeGlobalConfigUpdateOutcome =
  | Exclude<ClaudeFolderTrustOutcome, 'granted'>
  | 'updated'

/** Keep change pure: it runs before locking and again against the latest config under the lock. */
export function updateClaudeGlobalConfig(
  configFile: string,
  change: (config: Record<string, unknown>) => ClaudeGlobalConfigChange
): Promise<ClaudeGlobalConfigUpdateOutcome> {
  return runSerializedForClaudeConfig(configFile, () =>
    updateClaudeGlobalConfigNow({ configFile, change })
  )
}

async function updateClaudeGlobalConfigNow(args: {
  configFile: string
  change: (config: Record<string, unknown>) => ClaudeGlobalConfigChange
}): Promise<ClaudeGlobalConfigUpdateOutcome> {
  const probe = await readConfigAt(await resolveConfigTarget(args.configFile))
  if (typeof probe === 'string') {
    return probe
  }
  const planned = args.change(probe.config).kind
  if (planned !== 'changed') {
    return planned === 'refuse' ? 'unreadable' : 'unchanged'
  }

  // Copy guest permissions before taking the config lock.
  const replacement = await createReplacementFile(probe.path)
  try {
    let release: () => Promise<void>
    try {
      release = await lockClaudeConfig(args.configFile)
    } catch {
      return 'locked'
    }
    try {
      const current = await readConfigAt(await resolveConfigTarget(args.configFile))
      if (typeof current === 'string') {
        return current
      }
      // A retargeted symlink invalidates the prepared permissions.
      if (current.path !== replacement.target) {
        return 'unreadable'
      }
      const change = args.change(current.config)
      if (change.kind === 'refuse') {
        return 'unreadable'
      }
      if (change.kind === 'unchanged') {
        return 'unchanged'
      }
      await replaceConfig(replacement, change.config)
      return 'updated'
    } finally {
      await release().catch(() => {})
    }
  } finally {
    await rm(replacement.path, { force: true })
  }
}

async function claudeTrustKeysForHostPath(
  workspacePath: string,
  keyStyle: ClaudeTrustPathStyle,
  toClaudePath: (hostPath: string) => string | null = (hostPath) => hostPath
): Promise<string[]> {
  const forms = [resolve(workspacePath)]
  try {
    forms.push(await realpath(workspacePath))
  } catch {
    // The resolved form alone still matches an unsymlinked path.
  }
  const keys = new Set<string>()
  for (const form of forms) {
    const claudePath = toClaudePath(form)
    if (claudePath) {
      keys.add(toClaudeTrustKey(claudePath, keyStyle))
    }
  }
  return [...keys]
}

export type ClaudeTrustConfigTarget = {
  configFile: string
  keyStyle: ClaudeTrustPathStyle
  /** Maps a host-native path to the path the Claude process sees (WSL UNC → Linux). */
  toClaudePath?: (hostPath: string) => string | null
}

export function resolveLocalClaudeTrustConfig(args: {
  workspacePath: string
  env: Record<string, string | undefined>
  claudeAuth: ClaudeRuntimeAuthPreparation | null
  wslDistro: string | null
}): ClaudeTrustConfigTarget | null {
  const { claudeAuth } = args
  if (claudeAuth?.runtime === 'wsl' || args.wslDistro || parseWslUncPath(args.workspacePath)) {
    // Without guest auth preparation, configDir may name the Windows host's file.
    if (
      claudeAuth?.runtime !== 'wsl' ||
      !claudeAuth.wslLinuxConfigDir ||
      !parseWslUncPath(args.workspacePath)
    ) {
      return null
    }
    const legacyFile = join(claudeAuth.configDir, '.config.json')
    return {
      configFile: existsSync(legacyFile)
        ? legacyFile
        : claudeAuth.envPatch.CLAUDE_CONFIG_DIR
          ? join(claudeAuth.configDir, '.claude.json')
          : join(dirname(claudeAuth.configDir), '.claude.json'),
      keyStyle: 'posix',
      toClaudePath: (hostPath) => parseWslUncPath(hostPath)?.linuxPath ?? null
    }
  }
  const style = process.platform === 'win32' ? 'win32' : 'posix'
  const homeDir = (style === 'win32' ? args.env.USERPROFILE : args.env.HOME) || homedir()
  return {
    configFile: resolveClaudeGlobalConfigFile({
      env: args.env,
      homeDir,
      style,
      exists: existsSync
    }),
    keyStyle: style
  }
}

export async function grantClaudeWorkspaceTrust(
  target: ClaudeTrustConfigTarget,
  workspacePath: string
): Promise<ClaudeFolderTrustOutcome> {
  const folderKeys = await claudeTrustKeysForHostPath(
    workspacePath,
    target.keyStyle,
    target.toClaudePath
  )
  return folderKeys.length === 0
    ? 'unchanged'
    : grantClaudeFolderTrust({ configFile: target.configFile, folderKeys })
}
