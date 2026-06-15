import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { requireAuth, requireProjectMember } from '../../lib/route-helpers'

export function taskDependenciesRoutes() {
  return new Elysia()
    .post('/api/tasks/:id/dependencies', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const task = await prisma.task.findUnique({
        where: { id: params.id, deletedAt: null },
        select: { projectId: true },
      })
      if (!task) {
        set.status = 404
        return { error: 'Task not found' }
      }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
      const body = (await request.json()) as { blockedById?: string }
      if (!body.blockedById) {
        set.status = 400
        return { error: 'blockedById wajib diisi' }
      }
      if (body.blockedById === params.id) {
        set.status = 400
        return { error: 'Task cannot block itself' }
      }
      const blocker = await prisma.task.findUnique({ where: { id: body.blockedById }, select: { projectId: true } })
      if (!blocker || blocker.projectId !== task.projectId) {
        set.status = 400
        return { error: 'Blocker task must be in the same project' }
      }
      const visited = new Set<string>()
      const queue: string[] = [body.blockedById]
      while (queue.length) {
        const cur = queue.shift() as string
        if (visited.has(cur)) continue
        visited.add(cur)
        if (cur === params.id) {
          set.status = 400
          return { error: 'Dependency would create a cycle' }
        }
        const parents = await prisma.taskDependency.findMany({ where: { taskId: cur }, select: { blockedById: true } })
        for (const p of parents) queue.push(p.blockedById)
      }
      const dep = await prisma.taskDependency
        .create({ data: { taskId: params.id, blockedById: body.blockedById } })
        .catch((e: unknown) => {
          if ((e as { code?: string }).code === 'P2002') return null
          throw e
        })
      if (!dep) {
        set.status = 409
        return { error: 'Dependency already exists' }
      }
      emitInvalidate('tasks', { projectId: task.projectId })
      return { dependency: dep }
    })

    .delete('/api/tasks/:id/dependencies/:blockedById', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const task = await prisma.task.findUnique({
        where: { id: params.id, deletedAt: null },
        select: { projectId: true },
      })
      if (!task) {
        set.status = 404
        return { error: 'Task not found' }
      }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
      await prisma.taskDependency.delete({
        where: { taskId_blockedById: { taskId: params.id, blockedById: params.blockedById } },
      })
      emitInvalidate('tasks', { projectId: task.projectId })
      return { ok: true }
    })
}
