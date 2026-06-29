export type TextSegment =
  | { type: 'text'; value: string; start: number }
  | { type: 'link'; value: string; href: string; start: number }

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;!?)\]}'"])/gi

export function parseLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start), start: lastIndex })
    }
    segments.push({ type: 'link', value: url, href: url, start })
    lastIndex = start + url.length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex), start: lastIndex })
  }
  return segments
}
