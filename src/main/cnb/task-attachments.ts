import { z } from 'zod'
import { lazyZodSchema } from '../../shared/schema/lazy-zod-schema'
import type { CnbAttachmentResult } from '../../shared/cnb/cnb-tasks'
import { cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import { credential } from './task-schema'

export type CnbAttachTarget =
  | { kind: 'issue-comment'; repository: string; number: number }
  | { kind: 'repo'; repository: string }

const assetUploadUrl = lazyZodSchema(() =>
  z.object({
    asset_link: z.string().nullish(),
    download_url: z.string().nullish(),
    path: z.string().nullish(),
    upload_url: z.string().nullish(),
    name: z.string().nullish()
  })
)

const repoUploadResponse = lazyZodSchema(() =>
  z.object({
    upload_url: z.string(),
    assets: z.object({ path: z.string().nullish(), name: z.string().nullish() }).nullish(),
    form: z.record(z.string(), z.string()).nullish()
  })
)

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon'
])

function markdownFor(name: string, url: string, image: boolean): string {
  const label = name.replace(/[[\]\\\r\n]/g, ' ').trim() || 'attachment'
  const destination = url.replaceAll('(', '%28').replaceAll(')', '%29')
  return image ? `![${label}](${destination})` : `[${label}](${destination})`
}

function httpsAttachmentUrl(value: string, base?: string): URL {
  const url = new URL(value, base)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid CNB attachment URL.')
  }
  return url
}

function isImage(contentType: string, name: string): boolean {
  if (IMAGE_TYPES.has(contentType.toLowerCase())) {
    return true
  }
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name)
}

async function putBytes(
  uploadUrl: string,
  bytes: Uint8Array,
  contentType: string,
  form?: Record<string, string> | null
): Promise<void> {
  const url = httpsAttachmentUrl(uploadUrl)
  // Copy into a plain ArrayBuffer-backed view so the body type is a concrete Blob/BodyInit.
  const payload = new Uint8Array(bytes.byteLength)
  payload.set(bytes)
  // Some providers return a presigned POST with form fields; others a PUT target.
  if (form && Object.keys(form).length > 0) {
    const body = new FormData()
    for (const [key, value] of Object.entries(form)) {
      body.append(key, value)
    }
    body.append('file', new Blob([payload], { type: contentType }), 'file')
    const response = await fetch(url, {
      method: 'POST',
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000)
    })
    if (!response.ok) {
      await discardCnbBody(response)
      throw new Error(`Upload failed (HTTP ${response.status}).`)
    }
    await discardCnbBody(response)
    return
  }
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: payload,
    redirect: 'error',
    signal: AbortSignal.timeout(60_000)
  })
  if (!response.ok) {
    await discardCnbBody(response)
    throw new Error(`Upload failed (HTTP ${response.status}).`)
  }
  await discardCnbBody(response)
}

/**
 * Uploads one attachment through CNB's documented channels and returns the Markdown to insert.
 * Issue comments use the comment asset endpoints (asset_link); new issues/PRs use the repo-wide
 * upload endpoints. CNB supplies a presigned destination for the attachment bytes.
 */
export async function uploadCnbAttachment(args: {
  target: CnbAttachTarget
  fileName: string
  contentType: string
  bytes: Uint8Array
}): Promise<CnbAttachmentResult> {
  const token = await credential()
  if (!token) {
    return { ok: false, reason: 'not-connected' }
  }
  const name = args.fileName.trim() || 'attachment'
  if (args.bytes.byteLength === 0) {
    return { ok: false, reason: 'empty' }
  }
  const image = isImage(args.contentType, name)
  try {
    if (args.target.kind === 'issue-comment') {
      const suffix = image ? 'comment-image-asset-upload-url' : 'comment-file-asset-upload-url'
      const response = await cnbRequest(
        `${cnbRepositoryPath(args.target.repository)}/issues/${args.target.number}/${suffix}`,
        token,
        undefined,
        {
          method: 'POST',
          body: { name, size: args.bytes.byteLength, content_type: args.contentType }
        }
      )
      if (!response.ok) {
        await discardCnbBody(response)
        return { ok: false, reason: `HTTP ${response.status}` }
      }
      const asset = assetUploadUrl.parse(await response.json())
      if (!asset.upload_url) {
        return { ok: false, reason: 'no-upload-url' }
      }
      const link = asset.asset_link ?? asset.download_url ?? asset.path ?? ''
      if (!link) {
        return { ok: false, reason: 'no-asset-link' }
      }
      const url = httpsAttachmentUrl(link, 'https://cnb.cool').href
      await putBytes(asset.upload_url, args.bytes, args.contentType)
      return { ok: true, url, markdown: markdownFor(name, url, image) }
    }
    const endpoint = image ? 'imgs' : 'files'
    const response = await cnbRequest(
      `${cnbRepositoryPath(args.target.repository)}/upload/${endpoint}`,
      token,
      undefined,
      {
        method: 'POST',
        body: { name, size: args.bytes.byteLength }
      }
    )
    if (!response.ok) {
      await discardCnbBody(response)
      return { ok: false, reason: `HTTP ${response.status}` }
    }
    const uploaded = repoUploadResponse.parse(await response.json())
    const path = uploaded.assets?.path
    if (!path) {
      return { ok: false, reason: 'no-asset-path' }
    }
    const url = httpsAttachmentUrl(path, 'https://cnb.cool').href
    await putBytes(uploaded.upload_url, args.bytes, args.contentType, uploaded.form)
    return { ok: true, url, markdown: markdownFor(name, url, image) }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'upload-failed' }
  }
}
