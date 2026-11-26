import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GitHubMarkdownComposer } from '@/components/github/GitHubMarkdownComposer'
import type { PreloadApi } from '../../../../../preload/api-types'

type CnbApi = NonNullable<PreloadApi['cnb']>

export type CnbAttachTarget = {
  repoId: string
  /** Existing issues use the issue-scoped upload. Other editors use repository uploads. */
  issueNumber: number | null
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma === -1 ? '' : result.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

function useCnbAttachmentUploader(
  api: CnbApi | undefined,
  target: CnbAttachTarget | null,
  onError?: (message: string) => void
) {
  return useCallback(
    async (file: File, signal?: AbortSignal) => {
      if (!api || !target) {
        throw new Error('Open this CNB repository before attaching a file.')
      }
      signal?.throwIfAborted()
      const base64 = await readFileBase64(file)
      signal?.throwIfAborted()
      const result = await api.uploadAttachment({
        repoId: target.repoId,
        issueNumber: target.issueNumber,
        fileName: file.name || 'attachment',
        contentType: file.type || 'application/octet-stream',
        base64
      })
      if (!result.ok) {
        const message = `Could not attach ${file.name}: ${result.reason}`
        onError?.(message)
        throw new Error(message)
      }
      return result
    },
    [api, target, onError]
  )
}

/**
 * A CNB body/comment editor: the shared rich markdown composer with CNB image upload, drop/paste,
 * and an attach-file button. Inserting a file's Markdown is handled by the composer's image path
 * for images and by onAttachFile for arbitrary files.
 */
export function CnbMarkdownComposer({
  api,
  target,
  value,
  onChange,
  placeholder,
  disabled,
  onPendingChange,
  onError
}: {
  api: CnbApi | undefined
  target: CnbAttachTarget | null
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  onPendingChange?: (pending: boolean) => void
  onError?: (message: string) => void
}): React.JSX.Element {
  const uploader = useCnbAttachmentUploader(api, target, onError)
  const uploadImage = useCallback(
    async (image: File, signal?: AbortSignal) => (await uploader(image, signal)).url,
    [uploader]
  )
  const [imagePending, setImagePending] = useState(false)
  const [filePending, setFilePending] = useState(false)
  const draft = useRef(value)
  useLayoutEffect(() => {
    draft.current = value
  }, [value])
  useEffect(() => {
    onPendingChange?.(imagePending || filePending)
  }, [imagePending, filePending, onPendingChange])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const attach = useCallback(() => {
    fileInputRef.current?.click()
  }, [])
  const onFilePicked = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file || !target || disabled || filePending) {
        return
      }
      setFilePending(true)
      try {
        const { markdown } = await uploader(file)
        const current = draft.current
        onChange(`${current}${current ? '\n\n' : ''}${markdown}\n`)
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Could not attach the file.')
      } finally {
        setFilePending(false)
      }
    },
    [disabled, filePending, target, uploader, onChange, onError]
  )
  return (
    <>
      <GitHubMarkdownComposer
        imageUploader={api && target ? uploadImage : undefined}
        onAttachFile={api && target && !filePending ? attach : undefined}
        onImageUploadPendingChange={setImagePending}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        minHeightClassName="min-h-32"
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => void onFilePicked(event)}
      />
    </>
  )
}
