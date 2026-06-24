import type { RouteMetadata } from './types'

export const TASK_ROUTES: RouteMetadata[] = [
  { method: 'GET', path: '/api/tasks', auth: 'authenticated', category: 'tasks', description: 'List tasks (filter: projectId, status, kind, assigneeId, mine=1)' },
  { method: 'POST', path: '/api/tasks', auth: 'authenticated', category: 'tasks', description: 'Create task in a project (member only)' },
  { method: 'GET', path: '/api/tasks/:id', auth: 'authenticated', category: 'tasks', description: 'Task detail with comments + evidence (member only)' },
  { method: 'PATCH', path: '/api/tasks/:id', auth: 'authenticated', category: 'tasks', description: 'Update task fields (member only; status transitions enforced)' },
  { method: 'DELETE', path: '/api/tasks/:id', auth: 'authenticated', category: 'tasks', description: 'Delete task (reporter, OWNER/PM, or SUPER_ADMIN)' },
  { method: 'POST', path: '/api/tasks/bulk-delete', auth: 'authenticated', category: 'tasks', description: 'Bulk delete tasks' },
  { method: 'POST', path: '/api/tasks/:id/comments', auth: 'authenticated', category: 'tasks', description: 'Comment on task (member only)' },
  { method: 'POST', path: '/api/tasks/:id/evidence', auth: 'authenticated', category: 'tasks', description: 'Attach evidence to task (member only)' },
  { method: 'POST', path: '/api/tasks/:id/evidence/upload', auth: 'authenticated', category: 'tasks', description: 'Upload evidence file (multipart; max UPLOAD_MAX_BYTES)' },
  { method: 'GET', path: '/api/evidence/:file', auth: 'authenticated', category: 'tasks', description: "Stream evidence file (member of owning task's project)" },
  { method: 'GET', path: '/api/projects/:id/tags', auth: 'authenticated', category: 'tasks', description: 'List project tags (member only)' },
  { method: 'POST', path: '/api/projects/:id/tags', auth: 'authenticated', category: 'tasks', description: 'Create project tag (member with write access)' },
  { method: 'PATCH', path: '/api/tags/:id', auth: 'authenticated', category: 'tasks', description: 'Rename/recolor tag' },
  { method: 'DELETE', path: '/api/tags/:id', auth: 'authenticated', category: 'tasks', description: 'Delete tag' },
  { method: 'POST', path: '/api/tasks/:id/dependencies', auth: 'authenticated', category: 'tasks', description: 'Add blocked-by dependency (same-project only)' },
  { method: 'DELETE', path: '/api/tasks/:id/dependencies/:blockedById', auth: 'authenticated', category: 'tasks', description: 'Remove blocked-by dependency' },
  { method: 'POST', path: '/api/tasks/:id/checklist', auth: 'authenticated', category: 'tasks', description: 'Add checklist item' },
  { method: 'PATCH', path: '/api/checklist/:id', auth: 'authenticated', category: 'tasks', description: 'Toggle/rename checklist item' },
  { method: 'DELETE', path: '/api/checklist/:id', auth: 'authenticated', category: 'tasks', description: 'Delete checklist item' },
]
