import type { RouteMetadata } from './types'

export const ADMIN_ROUTES: RouteMetadata[] = [
  { method: 'GET', path: '/api/admin/users', auth: 'superAdmin', category: 'admin', description: 'List all users' },
  { method: 'PUT', path: '/api/admin/users/:id/role', auth: 'superAdmin', category: 'admin', description: 'Change user role' },
  { method: 'PUT', path: '/api/admin/users/:id/block', auth: 'superAdmin', category: 'admin', description: 'Block/unblock user' },
  { method: 'GET', path: '/api/admin/presence', auth: 'superAdmin', category: 'admin', description: 'Online user IDs' },
  { method: 'GET', path: '/api/admin/logs/app', auth: 'superAdmin', category: 'admin', description: 'App logs (Redis)' },
  { method: 'GET', path: '/api/admin/logs/audit', auth: 'superAdmin', category: 'admin', description: 'Audit logs (DB)' },
  { method: 'DELETE', path: '/api/admin/logs/app', auth: 'superAdmin', category: 'admin', description: 'Clear app logs' },
  { method: 'DELETE', path: '/api/admin/logs/audit', auth: 'superAdmin', category: 'admin', description: 'Clear audit logs' },
  { method: 'GET', path: '/api/admin/schema', auth: 'superAdmin', category: 'admin', description: 'Database schema (Prisma)' },
  { method: 'GET', path: '/api/admin/routes', auth: 'superAdmin', category: 'admin', description: 'Routes metadata' },
  { method: 'GET', path: '/api/admin/project-structure', auth: 'superAdmin', category: 'admin', description: 'Project file structure' },
  { method: 'GET', path: '/api/admin/env-map', auth: 'superAdmin', category: 'admin', description: 'Environment variables map' },
  { method: 'GET', path: '/api/admin/test-coverage', auth: 'superAdmin', category: 'admin', description: 'Test coverage mapping' },
  { method: 'GET', path: '/api/admin/dependencies', auth: 'superAdmin', category: 'admin', description: 'NPM dependencies graph' },
  { method: 'GET', path: '/api/admin/migrations', auth: 'superAdmin', category: 'admin', description: 'Migration timeline' },
  { method: 'GET', path: '/api/admin/sessions', auth: 'superAdmin', category: 'admin', description: 'Active sessions (live)' },
]
