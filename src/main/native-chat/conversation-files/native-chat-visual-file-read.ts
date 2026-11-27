// Enforce visual containment on the host: direct regular files, no symlinks, bounded UTF-8 text.
// Reads a bare scratch-folder name, or an absolute path a Codex reference named, confined to the session's
// workspace or scratch folder. Codex emits a fragment, which the frame shell accepts beside a full document.

import { createHash } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import { basename, dirname, join, relative, isAbsolute, sep } from 'node:path'
import {
  NATIVE_CHAT_VISUAL_MAX_BYTES,
  isNativeChatVisualFileName,
  isNativeChatVisualPath
} from '../../../shared/native-chat/visuals/native-chat-visual-directive'
import type {
  AgentSessionReadVisualResult,
  AgentSessionVisualReadError
} from '../../../shared/rpc-contract/structured-agent-session/agent-session-visual-params'
import { isENOENT } from '../../filesystem/local-file-io/filesystem-path-containment'
import { readLocalFileBounded } from '../../filesystem/local-file-io/local-regular-file-read'

// O_NOFOLLOW prevents final-component swaps; Windows relies on lstat and post-open identity checks.
const VISUAL_OPEN_FLAGS =
  constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0)

const REVISION_HEX_LENGTH = 32

class VisualReadRefusal extends Error {
  constructor(readonly refusal: AgentSessionVisualReadError) {
    super(refusal)
  }
}

function refuse(refusal: AgentSessionVisualReadError): never {
  throw new VisualReadRefusal(refusal)
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

/** Reject symlinks in either owned directory so they cannot redirect all reads. */
async function canonicalFolder(folder: string): Promise<string> {
  try {
    // Check parent first for deterministic broken-path refusals.
    const parentStats = await lstat(dirname(folder))
    const owned = [parentStats, await lstat(folder)]
    if (owned.some((stats) => stats.isSymbolicLink())) {
      refuse('outside_folder')
    }
    if (owned.some((stats) => !stats.isDirectory())) {
      refuse('not_found')
    }
    return await realpath(folder)
  } catch (error) {
    if (error instanceof VisualReadRefusal) {
      throw error
    }
    if (isENOENT(error) || errorCode(error) === 'ENOTDIR') {
      refuse('not_found')
    }
    throw error
  }
}

async function openVisual(candidate: string): Promise<FileHandle> {
  try {
    if ((await lstat(candidate)).isSymbolicLink()) {
      refuse('outside_folder')
    }
    return await open(candidate, VISUAL_OPEN_FLAGS)
  } catch (error) {
    if (error instanceof VisualReadRefusal) {
      throw error
    }
    if (isENOENT(error) || errorCode(error) === 'ENOTDIR') {
      refuse('not_found')
    }
    // Open detected a symlink swap after lstat.
    if (errorCode(error) === 'ELOOP' || errorCode(error) === 'EMLINK') {
      refuse('outside_folder')
    }
    if (errorCode(error) === 'EISDIR') {
      refuse('not_a_file')
    }
    throw error
  }
}

/** Recheck both file containment and the owned directory to detect symlink swaps around the initial check. */
async function assertStillContained(
  folder: string,
  candidate: string,
  folderReal: string,
  file: string,
  opened: Stats
): Promise<void> {
  let resolved: string
  let current: Stats
  try {
    const [parentNow, folderNow, canonicalFolderNow] = await Promise.all([
      lstat(dirname(folder)),
      lstat(folder),
      lstat(folderReal)
    ])
    if (
      parentNow.isSymbolicLink() ||
      folderNow.isSymbolicLink() ||
      !sameFile(folderNow, canonicalFolderNow)
    ) {
      refuse('outside_folder')
    }
    resolved = await realpath(candidate)
    current = await lstat(candidate)
  } catch (error) {
    if (error instanceof VisualReadRefusal) {
      throw error
    }
    if (isENOENT(error)) {
      refuse('not_found')
    }
    throw error
  }
  // Case-insensitive volumes may return the stored filename case.
  if (
    dirname(resolved) !== folderReal ||
    basename(resolved).toLowerCase() !== file.toLowerCase() ||
    current.isSymbolicLink() ||
    !sameFile(current, opened)
  ) {
    refuse('outside_folder')
  }
}

/** Return the file's UTF-8 text as-is: the frame injects either a fragment or a full document into its shell. */
function decodeVisualText(buffer: Buffer): string {
  if (buffer.includes(0)) {
    refuse('not_text')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return refuse('not_text')
  }
}

export function nativeChatVisualRevision(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, REVISION_HEX_LENGTH)
}

/** Where a read may look: the chat's scratch folder, and the session's workspace for an absolute path. */
export type NativeChatVisualReadRoots = {
  scratchFolder: string
  workspaceRoot?: string
}

/** Resolve a requested read to the folder that owns the file, refusing paths outside every owned root. */
function resolveCandidate(
  roots: NativeChatVisualReadRoots,
  file: string | undefined,
  path: string | undefined
): { folder: string; file: string } {
  if (path !== undefined) {
    if (!isNativeChatVisualPath(path) || !isAbsolute(path)) {
      refuse('outside_folder')
    }
    const ownedRoots = [roots.workspaceRoot, roots.scratchFolder].filter(
      (root): root is string => root !== undefined
    )
    const inRoot = ownedRoots.find((root) => {
      const rel = relative(root, path)
      return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
    })
    if (!inRoot) {
      refuse('outside_folder')
    }
    return { folder: dirname(path), file: basename(path) }
  }
  if (file === undefined || !isNativeChatVisualFileName(file)) {
    refuse('outside_folder')
  }
  return { folder: roots.scratchFolder, file }
}

/** An owned root's canonical path, or null when it does not resolve. */
async function canonicalRoot(root: string | undefined): Promise<string | null> {
  if (root === undefined) {
    return null
  }
  try {
    return await realpath(root)
  } catch {
    return null
  }
}

async function readContained(
  roots: NativeChatVisualReadRoots,
  file: string | undefined,
  path: string | undefined,
  knownRevision: string | undefined
): Promise<AgentSessionReadVisualResult> {
  const target = resolveCandidate(roots, file, path)
  const folderReal = await canonicalFolder(target.folder)
  // A Codex absolute path may sit under a subdirectory; prove its real location stays inside an owned root.
  if (path !== undefined) {
    const [workspaceReal, scratchReal] = await Promise.all([
      canonicalRoot(roots.workspaceRoot),
      canonicalRoot(roots.scratchFolder)
    ])
    const insideOwnedRoot = [workspaceReal, scratchReal].some(
      (root) =>
        root !== null &&
        (folderReal === root ||
          folderReal.startsWith(`${root}${sep}`) ||
          folderReal.toLowerCase().startsWith(`${root.toLowerCase()}${sep}`))
    )
    if (!insideOwnedRoot) {
      refuse('outside_folder')
    }
  }
  const candidate = join(folderReal, target.file)
  if (dirname(candidate) !== folderReal) {
    refuse('outside_folder')
  }
  const handle = await openVisual(candidate)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) {
      refuse('not_a_file')
    }
    if (stats.size > NATIVE_CHAT_VISUAL_MAX_BYTES) {
      refuse('too_large')
    }
    await assertStillContained(target.folder, candidate, folderReal, target.file, stats)
    let buffer: Buffer
    try {
      buffer = await readLocalFileBounded(handle, NATIVE_CHAT_VISUAL_MAX_BYTES, stats.size)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('File too large')) {
        refuse('too_large')
      }
      throw error
    }
    const html = decodeVisualText(buffer)
    const revision = nativeChatVisualRevision(buffer)
    const sizeBytes = buffer.length
    // Keep the named folder path so the file-root selector matches exactly.
    const resolvedPath = join(target.folder, target.file)
    return knownRevision === revision
      ? { ok: true, revision, sizeBytes, path: resolvedPath, unchanged: true }
      : { ok: true, revision, sizeBytes, path: resolvedPath, html }
  } finally {
    await handle.close()
  }
}

/** Unexpected faults throw code-only errors; clients show unavailable without exposing host paths. */
export async function readNativeChatVisualFile(input: {
  scratchFolder: string
  file?: string
  path?: string
  workspaceRoot?: string
  knownRevision?: string
}): Promise<AgentSessionReadVisualResult> {
  const roots: NativeChatVisualReadRoots = {
    scratchFolder: input.scratchFolder,
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {})
  }
  try {
    return await readContained(roots, input.file, input.path, input.knownRevision)
  } catch (error) {
    if (error instanceof VisualReadRefusal) {
      return { ok: false, error: error.refusal }
    }
    throw new Error(`visual_read_failed:${errorCode(error) ?? 'unknown'}`, { cause: error })
  }
}
