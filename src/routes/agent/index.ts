import { Elysia } from 'elysia'
import { agentChecklistRoutes } from './checklist.route'
import { agentCommentRoutes } from './comments.route'
import { agentProjectRoutes } from './project.route'
import { agentTaskReadRoutes } from './tasks.route'
import { agentTaskWriteRoutes } from './writes.route'

// Token-only REST surface for coding agents (CLI). Every route is scoped to the
// token's project; agents never pass projectId. See /api/agent/guide + docs/API.md.
// Read routes are mounted first so GET /api/agent/tasks/stats resolves as a static
// path before the /api/agent/tasks/:id param route.
export function agentRoutes() {
  return new Elysia()
    .use(agentTaskReadRoutes())
    .use(agentTaskWriteRoutes())
    .use(agentCommentRoutes())
    .use(agentChecklistRoutes())
    .use(agentProjectRoutes())
}
