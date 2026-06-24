import type { FileHealth } from './types'

export function openInEditor(relativePath: string) {
  fetch('/__open-in-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relativePath, lineNumber: '1', columnNumber: '1' }),
  }).catch(() => {})
}

export function fmt(n: number): string {
  return n.toLocaleString()
}

export function buildCopyText(files: FileHealth[]): string {
  return files.map((f) => `${f.path}  (${f.lines} baris, ${f.pct}%)`).join('\n')
}
