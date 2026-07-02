import type { Role } from '@/frontend/hooks/useAuth'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
  createdAt: string
  image?: string | null
}

export const roleBadge: Record<string, { color: string; label: string }> = {
  USER: { color: 'blue', label: 'User' },
  QC: { color: 'teal', label: 'QC' },
  ADMIN: { color: 'violet', label: 'Admin' },
  SUPER_ADMIN: { color: 'red', label: 'Super Admin' },
}

export const roleFilterOptions = [
  { value: '', label: 'Semua role' },
  { value: 'USER', label: 'User' },
  { value: 'QC', label: 'QC' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
]

export const PAGE_SIZE = 20
