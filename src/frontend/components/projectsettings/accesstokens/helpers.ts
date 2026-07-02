export type TokenScope = 'READ' | 'WRITE'
export type TokenStatus = 'ACTIVE' | 'REVOKED'

export interface TokenRow {
  id: string
  name: string
  tokenPrefix: string
  scope: TokenScope
  status: TokenStatus
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string; email: string } | null
}

export interface CreateResponse {
  token: Omit<TokenRow, 'lastUsedAt' | 'createdBy'>
  raw: string
}

export const STATUS_COLOR: Record<TokenStatus, string> = { ACTIVE: 'green', REVOKED: 'red' }
export const SCOPE_COLOR: Record<TokenScope, string> = { READ: 'blue', WRITE: 'grape' }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'baru saja'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  return `${Math.floor(h / 24)}h lalu`
}

export function formatExpiry(iso: string | null): string {
  if (!iso) return 'Tidak ada'
  const d = new Date(iso)
  return d.getTime() <= Date.now() ? `Kedaluwarsa` : d.toLocaleDateString()
}
