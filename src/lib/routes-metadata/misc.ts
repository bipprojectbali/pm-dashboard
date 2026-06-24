import type { RouteMetadata } from './types'

export const GITHUB_ROUTES: RouteMetadata[] = [
  { method: 'GET', path: '/api/projects/:id/github/summary', auth: 'authenticated', category: 'github', description: 'GitHub repo stats for project' },
  { method: 'GET', path: '/api/projects/:id/github/feed', auth: 'authenticated', category: 'github', description: 'Paginated GitHub events for project' },
  { method: 'POST', path: '/webhooks/github', auth: 'hmac', category: 'github', description: 'GitHub webhook ingestion (HMAC SHA-256 via GITHUB_WEBHOOK_SECRET)' },
]

export const UTILITY_ROUTES: RouteMetadata[] = [
  { method: 'POST', path: '/mcp', auth: 'shared-secret', category: 'mcp', description: 'MCP HTTP fallback (Bearer MCP_SECRET; scope by NODE_ENV)' },
  { method: 'GET', path: '/health', auth: 'public', category: 'utility', description: 'Health check' },
  { method: 'GET', path: '/api/version', auth: 'public', category: 'utility', description: 'App name + version from package.json' },
  { method: 'GET', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (GET)' },
  { method: 'PUT', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (PUT)' },
  { method: 'GET', path: '/api/hello/:name', auth: 'public', category: 'utility', description: 'Hello with name param' },
  { method: 'WS', path: '/ws/presence', auth: 'authenticated', category: 'realtime', description: 'Real-time presence tracking' },
]
