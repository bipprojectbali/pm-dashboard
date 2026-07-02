import { Elysia } from 'elysia'
import { agentChecklistRoutes } from './agent/checklist.route'
import { agentGuideRoutes } from './agent/guide.route'
import { agentTaskRoutes } from './agent/tasks.route'

// Token-only REST surface for coding agents (CLI). Every route is scoped to the
// token's project; agents never pass projectId. See /api/agent/guide + docs/API.md.
export function agentRoutes() {
  return new Elysia().use(agentGuideRoutes()).use(agentTaskRoutes()).use(agentChecklistRoutes())
}
