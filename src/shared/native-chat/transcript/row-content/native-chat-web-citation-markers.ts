const CITATION_START = '\uE200cite\uE202'

export function* nativeChatWebCitationMarkers(text: string): IterableIterator<RegExpExecArray> {
  const pattern = /\uE200cite(?:\uE202[\w-]+)+\uE201/g
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    yield match
  }
}

export function withoutNativeChatWebCitationMarkers(text: string): string {
  if (!text.includes('\uE200')) {
    return text
  }
  const pending = text.lastIndexOf('\uE200')
  const tail = text.slice(pending)
  if (
    CITATION_START.startsWith(tail) ||
    (tail.startsWith(CITATION_START) && /^[\w\uE202-]*$/.test(tail.slice(CITATION_START.length)))
  ) {
    text = text.slice(0, pending)
  }
  let result = ''
  let end = 0
  for (const marker of nativeChatWebCitationMarkers(text)) {
    result += text.slice(end, marker.index)
    end = marker.index + marker[0].length
  }
  return result + text.slice(end)
}
