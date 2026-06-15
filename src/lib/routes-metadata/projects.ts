import type { RouteMetadata } from './types'

export const PROJECT_ROUTES: RouteMetadata[] = [
  { method: 'GET', path: '/api/projects', auth: 'authenticated', category: 'projects', description: 'List projects user is a member of' },
  { method: 'POST', path: '/api/projects', auth: 'authenticated', category: 'projects', description: 'Create project (creator becomes OWNER)' },
  { method: 'GET', path: '/api/projects/:id', auth: 'authenticated', category: 'projects', description: 'Project detail with members + task count (members only)' },
  { method: 'PATCH', path: '/api/projects/:id', auth: 'authenticated', category: 'projects', description: 'Update project name/description/archived (OWNER or PM)' },
  { method: 'DELETE', path: '/api/projects/:id', auth: 'authenticated', category: 'projects', description: 'Delete project permanently (OWNER or SUPER_ADMIN)' },
  { method: 'POST', path: '/api/projects/:id/members', auth: 'authenticated', category: 'projects', description: 'Add member to project (OWNER, PM, or system admin)' },
  { method: 'PATCH', path: '/api/projects/:id/members/:userId', auth: 'authenticated', category: 'projects', description: 'Change member role' },
  { method: 'DELETE', path: '/api/projects/:id/members/:userId', auth: 'authenticated', category: 'projects', description: 'Remove member (OWNER, PM, or system admin)' },
  { method: 'POST', path: '/api/projects/:id/extend', auth: 'authenticated', category: 'projects', description: 'Extend project deadline (OWNER, PM, or system admin)' },
  { method: 'GET', path: '/api/projects/:id/extensions', auth: 'authenticated', category: 'projects', description: 'List deadline extension history (members only)' },
  { method: 'GET', path: '/api/milestones', auth: 'authenticated', category: 'projects', description: 'List milestones across all projects user is a member of' },
  { method: 'GET', path: '/api/projects/:id/milestones', auth: 'authenticated', category: 'projects', description: 'List project milestones (members only)' },
  { method: 'POST', path: '/api/projects/:id/milestones', auth: 'authenticated', category: 'projects', description: 'Create milestone (OWNER or PM)' },
  { method: 'PATCH', path: '/api/milestones/:id', auth: 'authenticated', category: 'projects', description: 'Update milestone or toggle completion (OWNER or PM)' },
  { method: 'DELETE', path: '/api/milestones/:id', auth: 'authenticated', category: 'projects', description: 'Delete milestone (OWNER or PM)' },
]
