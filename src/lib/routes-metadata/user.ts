import type { RouteMetadata } from './types'

export const USER_ROUTES: RouteMetadata[] = [
  { method: 'GET', path: '/api/me/preferences', auth: 'authenticated', category: 'user', description: 'Current user preferences' },
  { method: 'PUT', path: '/api/me/preferences', auth: 'authenticated', category: 'user', description: 'Update current user preferences' },
  { method: 'PUT', path: '/api/me/password', auth: 'authenticated', category: 'user', description: 'Change own password (requires currentPassword + newPassword, min 8 chars)' },
  { method: 'GET', path: '/api/me/sessions', auth: 'authenticated', category: 'user', description: 'List own active sessions with isCurrent flag' },
  { method: 'DELETE', path: '/api/me/sessions/others', auth: 'authenticated', category: 'user', description: 'Revoke all of own sessions except the current one' },
  { method: 'GET', path: '/api/me/audit', auth: 'authenticated', category: 'user', description: 'Recent 20 security-related audit events for current user' },
  { method: 'GET', path: '/api/me/notifications', auth: 'authenticated', category: 'notifications', description: 'List notifications (?limit=50&unread=1)' },
  { method: 'GET', path: '/api/me/notifications/unread-count', auth: 'authenticated', category: 'notifications', description: 'Unread notification count' },
  { method: 'POST', path: '/api/me/notifications/:id/read', auth: 'authenticated', category: 'notifications', description: 'Mark a notification as read' },
  { method: 'POST', path: '/api/me/notifications/read-all', auth: 'authenticated', category: 'notifications', description: 'Mark all notifications as read' },
  { method: 'DELETE', path: '/api/me/notifications/:id', auth: 'authenticated', category: 'notifications', description: 'Delete a notification' },
  { method: 'GET', path: '/api/me/team', auth: 'authenticated', category: 'team', description: "Teammates across user's projects with open/overdue task counts" },
  { method: 'GET', path: '/api/me/team-activity', auth: 'authenticated', category: 'team', description: "Recent task activity in user's shared projects" },
  { method: 'GET', path: '/api/users', auth: 'authenticated', category: 'users', description: 'Lightweight user directory for member/assignee pickers' },
]
