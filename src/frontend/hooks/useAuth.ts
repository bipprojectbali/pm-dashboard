import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

export type Role = 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
}

export function getDefaultRoute(role: Role): string {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return '/admin'
  if (role === 'QC') return '/qc'
  return '/pm'
}

// Sentinel error type agar global handler bisa membedakan 401 dari error lain
export class UnauthorizedError extends Error {
  status = 401
  constructor() { super('Session expired') }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Poll session setiap 5 menit — cukup untuk deteksi expire tanpa membebani server.
// Jika dapat 401 (session expired/deleted), query masuk error state dan
// global handler di App.tsx akan redirect ke /login.
export function useSession() {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => apiFetch<{ user: User | null }>('/api/auth/session'),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 10 * 60 * 1000,  // poll tiap 10 menit
    refetchIntervalInBackground: false, // jangan poll kalau tab tidak aktif
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiFetch<{ user: User }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'session'], data)
      navigate({ to: getDefaultRoute(data.user.role) })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['auth', 'session'] })
      navigate({ to: '/login' })
    },
  })
}
