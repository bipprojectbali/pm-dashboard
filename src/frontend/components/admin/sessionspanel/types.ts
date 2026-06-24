export const PAGE_SIZE = 25

export interface SessionRow {
  id: string
  userId: string
  userName: string
  userEmail: string
  userRole: string
  userBlocked: boolean
  userImage?: string | null
  isOnline: boolean
  createdAt: string
  expiresAt: string
  isExpired: boolean
}

export interface SessionsResponse {
  sessions: SessionRow[]
  summary: {
    totalSessions: number
    activeSessions: number
    expiredSessions: number
    onlineUsers: number
    byRole: Record<string, number>
  }
}

export type StatusFilter = 'all' | 'active' | 'online' | 'expired'

export const ROLE_COLOR: Record<string, string> = {
  USER: 'blue',
  QC: 'teal',
  ADMIN: 'violet',
  SUPER_ADMIN: 'red',
}

export function formatRelative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const suffix = diff < 0 ? 'ago' : 'from now'
  if (days > 0) return `${days}d ${suffix}`
  if (hours > 0) return `${hours}h ${suffix}`
  if (mins > 0) return `${mins}m ${suffix}`
  return `just now`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
