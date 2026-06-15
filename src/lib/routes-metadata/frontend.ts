import type { RouteMetadata } from './types'

export const FRONTEND_ROUTES: RouteMetadata[] = [
  { method: 'PAGE', path: '/', auth: 'public', category: 'frontend', description: 'Landing page' },
  { method: 'PAGE', path: '/login', auth: 'public', category: 'frontend', description: 'Login page (email/password + Google OAuth)' },
  { method: 'PAGE', path: '/dev', auth: 'superAdmin', category: 'frontend', description: 'Dev console (SUPER_ADMIN only)' },
  { method: 'PAGE', path: '/admin', auth: 'admin', category: 'frontend', description: 'Admin console (ADMIN+)' },
  { method: 'PAGE', path: '/pm', auth: 'authenticated', category: 'frontend', description: 'Project Manager (all authenticated)' },
  { method: 'PAGE', path: '/settings', auth: 'authenticated', category: 'frontend', description: 'User settings (all authenticated)' },
  { method: 'PAGE', path: '/dashboard', auth: 'admin', category: 'frontend', description: 'Legacy — redirects to /admin' },
  { method: 'PAGE', path: '/profile', auth: 'authenticated', category: 'frontend', description: 'Legacy — redirects to /settings' },
  { method: 'PAGE', path: '/blocked', auth: 'authenticated', category: 'frontend', description: 'Blocked user info page' },
]
