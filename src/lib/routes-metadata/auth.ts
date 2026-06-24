import type { RouteMetadata } from './types'

export const AUTH_ROUTES: RouteMetadata[] = [
  { method: 'POST', path: '/api/auth/login', auth: 'public', category: 'auth', description: 'Email/password login' },
  { method: 'POST', path: '/api/auth/logout', auth: 'authenticated', category: 'auth', description: 'Logout (delete session)' },
  { method: 'GET', path: '/api/auth/session', auth: 'public', category: 'auth', description: 'Check current session' },
  { method: 'GET/POST', path: '/api/auth/*', auth: 'public', category: 'auth', description: 'Better Auth handler (sign-in, sign-out, OAuth callback, session)' },
]
