import { toLocalDateStr } from '@/frontend/lib/dates'
import type { AuditLogEntry } from './types'

export const actionBadge: Record<string, { color: string; label: string }> = {
  LOGIN: { color: 'green', label: 'Login' },
  LOGOUT: { color: 'gray', label: 'Logout' },
  LOGIN_FAILED: { color: 'orange', label: 'Login Failed' },
  LOGIN_BLOCKED: { color: 'red', label: 'Login Blocked' },
  ROLE_CHANGED: { color: 'violet', label: 'Role Changed' },
  BLOCKED: { color: 'red', label: 'Blocked' },
  UNBLOCKED: { color: 'teal', label: 'Unblocked' },
  PROJECT_MEMBER_ROLE_CHANGED: { color: 'grape', label: 'Member Role Changed' },
  TASK_CREATED: { color: 'blue', label: 'Task Created' },
}

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
