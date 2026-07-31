import type { ProjectListItem, ProjectPriority, ProjectStatus } from '../ProjectsPanel'

export const PROJECT_DETAIL_TABS = [
  'overview',
  'tasks',
  'team',
  'milestones',
  'phases',
  'extensions',
  'retro',
  'settings',
] as const
export type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number]

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  DRAFT: 'gray',
  ACTIVE: 'blue',
  ON_HOLD: 'yellow',
  COMPLETED: 'green',
  CANCELLED: 'dark',
}

export const PRIORITY_COLOR: Record<ProjectPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export const ROLE_COLOR: Record<string, string> = {
  OWNER: 'red',
  PM: 'violet',
  MEMBER: 'blue',
  VIEWER: 'gray',
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function computeOverdue(p: Pick<ProjectListItem, 'endsAt' | 'status'>): { overdue: boolean; daysOver: number } {
  if (!p.endsAt) return { overdue: false, daysOver: 0 }
  if (p.status === 'COMPLETED' || p.status === 'CANCELLED') return { overdue: false, daysOver: 0 }
  const end = new Date(p.endsAt).getTime()
  const now = Date.now()
  if (end >= now) return { overdue: false, daysOver: 0 }
  return { overdue: true, daysOver: Math.round((now - end) / (24 * 3600 * 1000)) }
}

export function computeTimeProgress(p: Pick<ProjectListItem, 'startsAt' | 'endsAt'>): number | null {
  if (!p.startsAt || !p.endsAt) return null
  const start = new Date(p.startsAt).getTime()
  const end = new Date(p.endsAt).getTime()
  const now = Date.now()
  if (end <= start) return null
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

export function isSystemAdmin(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export function computeCanManage(myRole: string | null, systemRole: string | null | undefined): boolean {
  if (isSystemAdmin(systemRole)) return true
  return myRole === 'OWNER' || myRole === 'PM'
}

// Phase-specific permissions — mirror src/lib/phase-access.ts. Deliberately NOT
// computeCanManage: phases use SUPER_ADMIN-only bypass (not all system admins)
// and a creator-aware modify rule. Keep in sync with the backend helper.
export function canCreatePhaseFE(myRole: string | null, systemRole: string | null | undefined): boolean {
  if (systemRole === 'SUPER_ADMIN') return true
  return myRole === 'OWNER' || myRole === 'PM'
}

export function canModifyPhaseFE(
  phase: { createdById: string | null },
  myRole: string | null,
  systemRole: string | null | undefined,
  currentUserId: string | null,
): boolean {
  if (systemRole === 'SUPER_ADMIN') return true
  if (myRole === 'OWNER') return true
  if (myRole === 'PM' && phase.createdById != null && phase.createdById === currentUserId) return true
  return false
}
