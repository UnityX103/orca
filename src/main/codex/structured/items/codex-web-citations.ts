import { nativeChatWebCitationMarkers } from '../../../../shared/native-chat/transcript/row-content/native-chat-web-citation-markers'
import { toolWebSearchResults } from '../../../../shared/native-chat/tools/native-chat-tool-identity'
import { readRecord, readString } from '../../app-server/codex-item-field-readers'

type CitedText = { text: string; markdown: string }

export function codexWebCitationMessage(value: unknown): (CitedText & { id: string }) | null {
  const item = readRecord(value)
  const id = readString(item, 'id')
  if (!id || item.type !== 'message' || item.role !== 'assistant') {
    return null
  }
  const content = codexWebCitationContent(item.content)
  return content ? { id, ...content } : null
}

export function codexWebCitationContent(value: unknown): CitedText | null {
  if (!Array.isArray(value)) {
    return null
  }
  const parts = value.flatMap((entry: unknown) => {
    const part = readRecord(entry)
    const text = readString(part, 'text')
    return text === null ? [] : [{ text, markdown: citationMarkdown(text, part.annotations) }]
  })
  return parts.some(({ text, markdown }) => text !== markdown)
    ? {
        text: parts.map((part) => part.text).join(''),
        markdown: parts.map((part) => part.markdown).join('')
      }
    : null
}

function citationMarkdown(text: string, annotations: unknown): string {
  if (!Array.isArray(annotations) || !annotations.length || !text.includes('\uE200cite')) {
    return text
  }
  const sourcesByRange = new Map<string, Record<string, unknown>[]>()
  for (const value of annotations.slice(0, 100)) {
    const source = readRecord(value)
    if (source.type === 'url_citation') {
      const { start_index: start, end_index: end } = source
      if (typeof start !== 'number' || typeof end !== 'number') {
        continue
      }
      const key = `${start}:${end}`
      const sources = sourcesByRange.get(key) ?? []
      sources.push(source)
      sourcesByRange.set(key, sources)
    }
  }
  let result = ''
  let written = 0
  let position = 0
  let offset = 0
  for (const marker of nativeChatWebCitationMarkers(text)) {
    // Codex counts Unicode code points; JavaScript's match index counts UTF-16 code units.
    for (const character of text.slice(offset, marker.index)) {
      offset += character.length
      position += 1
    }
    const sources = toolWebSearchResults(
      sourcesByRange.get(`${position}:${position + marker[0].length}`)
    )
    if (sources.length) {
      result +=
        text.slice(written, marker.index) + sources.map(({ url }) => citationLink(url)).join(' ')
      written = marker.index + marker[0].length
    }
  }
  return result + text.slice(written)
}

function citationLink(url: string): string {
  const parsed = new URL(url)
  const label = parsed.hostname.replace(/[\\[\]`*_&<>]/g, '\\$&')
  // Escape Markdown destination delimiters without changing the URL's query parameters.
  const href = parsed.href.replace(/&/g, '&amp;').replace(/[<>\\]/g, encodeURIComponent)
  return `[${label}](<${href}>)`
}
