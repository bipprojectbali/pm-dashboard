import { Elysia } from 'elysia'
import { resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { deny, enrich, ownedTask, TASK_INCLUDE } from './shared'

// Read half of the agent task surface (list + get). Every route is scoped to
// the token's project; agents never pass projectId. Writes live in
// tasks.write.route.ts.
export function agentTaskRoutes() {
  return new Elysia()
    .get('/api/agent/tasks', async ({ request, query, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      const where: Record<string, unknown> = { projectId: auth.projectId, deletedAt: null }
      if (query.status) where.status = String(query.status)
      if (query.kind) where.kind = String(query.kind)
      if (query.assigneeEmail) {
        const u = await prisma.user.findUnique({
          where: { email: String(query.assigneeEmail) },
          select: { id: true },
        })
        where.assigneeId = u?.id ?? '__none__'
      }
      const limit = Math.min(Number(query.limit) || 50, 200)
      const tasks = await prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      })
      return { count: tasks.length, tasks: tasks.map(enrich) }
    })

    .get('/api/agent/tasks/:id', async ({ request, params, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      const task = await ownedTask(params.id, auth.projectId)
      if (!task) return deny(set, 404, 'Task not found')
      return { task: enrich(task) }
    })
}
