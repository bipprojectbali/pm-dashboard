import type { Role } from '@/frontend/hooks/useAuth'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
  createdAt: string
}

export interface AuditLogEntry {
  id: string
  userId: string | null
  action: string
  detail: string | null
  ip: string | null
  createdAt: string
  user: { name: string; email: string; image?: string | null } | null
}
