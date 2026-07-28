import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { getPermissionRule, meetsMinProjectRole } from '../../lib/permission-config'
import { isSystemAdmin, requireAuth, requireProjectMember } from '../../lib/route-helpers'
import { applyTaskUpdateSideEffects, buildTaskUpdateData, type TaskUpdateBody } from './task.update.helpers'

export function taskUpdateRoute() {
  return new Elysia().patch('/api/tasks/:id', async ({ request, params, set }) => {
    const auth = await requireAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const current = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null } })
    if (!current) {
      set.status = 404
      return { error: 'Task not found' }
    }
    const membership = await requireProjectMember(current.projectId, auth.userId)
    if (!isSystemAdmin(auth.role)) {
      const minWriteRoles = await getPermissionRule('permissions.task.write.minProjectRole')
      if (!membership || !meetsMinProjectRole(membership.role, minWriteRoles)) {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
    }
    const body = (await request.json()) as TaskUpdateBody
    const built = buildTaskUpdateData(body, current)
    if ('error' in built) {
      set.status = 400
      return { error: built.error }
    }
    const task = await prisma.task.update({ where: { id: params.id }, data: built.data })
    await applyTaskUpdateSideEffects({ task, current, body, auth, request, built })
    return { task }
  })
}
