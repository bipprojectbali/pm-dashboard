import { Elysia } from 'elysia'
import { checkAgentRateLimit } from '../../lib/agent-rate-limit'
import { agentChecklistRoutes } from './checklist.route'
import { agentCommentRoutes } from './comments.route'
import { agentDependenciesRoutes } from './dependencies.route'
import { agentEvidenceRoutes } from './evidence.route'
import { agentProjectRoutes } from './project.route'
import { agentClaimRoutes } from './task.claim.route'
import { agentTaskUpdateRoutes } from './task.update.route'
import { agentTaskReadRoutes } from './tasks.route'
import { agentTaskWriteRoutes } from './writes.route'

// Token-only REST surface for coding agents (CLI). Every route is scoped to the
// token's project; agents never pass projectId. See /api/agent/guide + docs/API.md.
// Read routes are mounted first so GET /api/agent/tasks/stats resolves as a static
// path before the /api/agent/tasks/:id param route.
export function agentRoutes() {
  return new Elysia()
    .onBeforeHandle(async ({ request, set }) => {
      const rl = await checkAgentRateLimit(request)
      if (!rl.ok) {
        set.status = 429
        return { error: 'Rate limit exceeded', retryAfter: rl.retryAfter }
      }
    })
    .use(agentTaskReadRoutes())
    .use(agentTaskWriteRoutes())
    .use(agentTaskUpdateRoutes())
    .use(agentCommentRoutes())
    .use(agentChecklistRoutes())
    .use(agentProjectRoutes())
    .use(agentEvidenceRoutes())
    .use(agentDependenciesRoutes())
    .use(agentClaimRoutes())
}
