import { toLocalDateStr } from '@/frontend/lib/dates'
import type { AuditLogEntry } from './types'

// actionBadge moved to ./action-badge.ts (grew to cover all ~56 audit actions).
// Re-exported here so existing `from './constants'` importers keep working.
export { actionBadge } from './action-badge'

export const PAGE_SIZE = 25

export const WINDOW_OPTIONS = [
  { label: '24 jam', value: '1' },
  { label: '7 hari', value: '7' },
  { label: '30 hari', value: '30' },
  { label: 'Semua', value: 'all' },
]

function csvEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCsv(rows: AuditLogEntry[]) {
  const header = ['createdAt', 'userName', 'userEmail', 'action', 'detail', 'ip'].join(',')
  const body = rows
    .map((r) =>
      [r.createdAt, r.user?.name ?? '', r.user?.email ?? '', r.action, r.detail ?? '', r.ip ?? '']
        .map(csvEscape)
        .join(','),
    )
    .join('\n')
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-logs-${toLocalDateStr(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
