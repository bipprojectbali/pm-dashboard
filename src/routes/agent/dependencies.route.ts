import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { deny, ownedTask, parseJson } from './shared'

// Add/remove task dependencies for the token-scoped agent surface.
// Cycle detection walks the blocker's dependency chain before inserting.
export function agentDependenciesRoutes() {
  return new Elysia()
    .post('/api/agent/tasks/:id/dependencies', async ({ request, params, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
      const task = await ownedTask(params.id, auth.projectId)
      if (!task) return deny(set, 404, 'Task not found')
      const parsed = await parseJson<{ blockedById?: string }>(request)
      if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')
      const { blockedById } = parsed.body
      if (!blockedById) return deny(set, 400, 'blockedById is required')
      if (blockedById === params.id) return deny(set, 400, 'Task cannot block itself')
      const blocker = await prisma.task.findUnique({
        where: { id: blockedById },
        select: { projectId: true },
      })
      if (!blocker || blocker.projectId !== auth.projectId)
        return deny(set, 400, 'Blocker task must be in the same project')
      const visited = new Set<string>()
      const queue = [blockedById]
      while (queue.length) {
        const cur = queue.shift() as string
        if (visited.has(cur)) continue
        visited.add(cur)
        if (cur === params.id) return deny(set, 400, 'Dependency would create a cycle')
        const parents = await prisma.taskDependency.findMany({
          where: { taskId: cur },
          select: { blockedById: true },
        })
        for (const p of parents) queue.push(p.blockedById)
      }
      const dep = await prisma.taskDependency
        .create({ data: { taskId: params.id, blockedById } })
        .catch((e: unknown) => {
          if ((e as { code?: string }).code === 'P2002') return null
          throw e
        })
      if (!dep) {
        set.status = 409
        return { error: 'Dependency already exists' }
      }
      emitInvalidate('tasks', { projectId: auth.projectId })
      return { dependency: dep }
    })

    .delete('/api/agent/tasks/:id/dependencies/:blockedById', async ({ request, params, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
      const task = await ownedTask(params.id, auth.projectId)
      if (!task) return deny(set, 404, 'Task not found')
      await prisma.taskDependency
        .delete({ where: { taskId_blockedById: { taskId: params.id, blockedById: params.blockedById } } })
        .catch(() => {})
      emitInvalidate('tasks', { projectId: auth.projectId })
      return { ok: true }
    })
}
