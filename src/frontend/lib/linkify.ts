export type TextSegment = { type: 'text'; value: string } | { type: 'link'; value: string; href: string }

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;!?)\]}'"])/gi

export function parseLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) })
    }
    segments.push({ type: 'link', value: url, href: url })
    lastIndex = start + url.length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}
