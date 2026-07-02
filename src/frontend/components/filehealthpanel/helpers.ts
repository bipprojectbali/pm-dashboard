import type { FileHealth, FileStatus } from './types'

export type SortKey = 'path' | 'lines' | 'chars' | 'pct' | 'status'
export type SortDir = 'asc' | 'desc'
export type StatusFilter = 'all' | 'warning' | 'over'

// Status ranking for sorting: over (worst) > warning > ok.
const STATUS_RANK: Record<FileStatus, number> = { ok: 0, warning: 1, over: 2 }

/** Filter by status bucket then case-insensitive substring match on path. */
export function filterFiles(files: FileHealth[], status: StatusFilter, search: string): FileHealth[] {
  const q = search.trim().toLowerCase()
  return files.filter((f) => {
    if (status === 'over' && f.status !== 'over') return false
    if (status === 'warning' && f.status === 'ok') return false
    if (q && !f.path.toLowerCase().includes(q)) return false
    return true
  })
}

/** Return a new sorted array (does not mutate input). Ties fall back to path asc. */
export function sortFiles(files: FileHealth[], key: SortKey, dir: SortDir): FileHealth[] {
  const factor = dir === 'asc' ? 1 : -1
  return [...files].sort((a, b) => {
    let cmp: number
    if (key === 'path') cmp = a.path.localeCompare(b.path)
    else if (key === 'lines') cmp = a.lines - b.lines
    else if (key === 'chars') cmp = a.chars - b.chars
    else if (key === 'pct') cmp = a.pct - b.pct
    else cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (cmp === 0 && key !== 'path') cmp = a.path.localeCompare(b.path)
    return cmp * factor
  })
}

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
