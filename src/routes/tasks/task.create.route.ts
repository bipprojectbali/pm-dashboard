import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { notifyTaskAssigned } from '../../lib/notifications'
import { emitInvalidate } from '../../lib/presence'
import { getPermissionRule, meetsMinProjectRole } from '../../lib/permission-config'
import { getIp, isSystemAdmin, requireAuth, requireProjectMember, writeAuditLog } from '../../lib/route-helpers'

export function taskCreateRoute() {
  return new Elysia().post('/api/tasks', async ({ request, set }) => {
    const auth = await requireAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const body = (await request.json()) as {
      projectId?: string
      kind?: string
      title?: string
      description?: string
      priority?: string
      route?: string
      assigneeId?: string
      startsAt?: string
      dueAt?: string
      estimateHours?: number
      tagIds?: string[]
      phaseId?: string
    }
    if (!body.projectId || !body.title || !body.description) {
      set.status = 400
      return { error: 'projectId, title, description wajib diisi' }
    }
    if (body.title.length > 500) {
      set.status = 400
      return { error: 'Title must be 500 characters or fewer' }
    }
    const TASK_KIND_VALUES = ['TASK', 'BUG', 'QC', 'TICKET', 'IDEA'] as const
    if (body.kind !== undefined && !(TASK_KIND_VALUES as readonly string[]).includes(body.kind)) {
      set.status = 400
      return { error: `kind must be one of: ${TASK_KIND_VALUES.join(', ')}` }
    }
    const membership = await requireProjectMember(body.projectId, auth.userId)
    if (!isSystemAdmin(auth.role)) {
      const minWriteRoles = await getPermissionRule('permissions.task.write.minProjectRole')
      if (!membership || !meetsMinProjectRole(membership.role, minWriteRoles)) {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
    }
    if (!membership) {
      const exists = await prisma.project.findUnique({ where: { id: body.projectId }, select: { id: true } })
      if (!exists) {
        set.status = 404
        return { error: 'Project not found' }
      }
    }
    if (body.tagIds?.length) {
      const validTags = await prisma.tag.findMany({
        where: { id: { in: body.tagIds }, projectId: body.projectId },
        select: { id: true },
      })
      if (validTags.length !== body.tagIds.length) {
        set.status = 400
        return { error: 'One or more tagIds do not exist in this project' }
      }
    }
    const task = await prisma.task.create({
      data: {
        projectId: body.projectId,
        kind: (body.kind as 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA') ?? 'TASK',
        title: body.title,
        description: body.description,
        priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
        route: body.route ?? null,
        reporterId: auth.userId,
        assigneeId: body.assigneeId ?? null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        estimateHours: typeof body.estimateHours === 'number' ? body.estimateHours : null,
        phaseId: body.phaseId ?? null,
        tags: body.tagIds?.length ? { create: body.tagIds.map((tagId) => ({ tagId })) } : undefined,
      },
    })
    writeAuditLog(auth.userId, 'TASK_CREATED', `#${task.id} ${task.title}`, getIp(request))
    appLog('info', `Task created: ${task.title} by ${auth.email}`)
    if (task.assigneeId && task.assigneeId !== auth.userId) {
      const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
      notifyTaskAssigned({
        taskId: task.id,
        projectId: task.projectId,
        taskTitle: task.title,
        assigneeId: task.assigneeId,
        actorId: auth.userId,
        actorName: actor?.name ?? 'Someone',
        taskKind: task.kind,
      }).catch(() => {})
    }
    emitInvalidate('tasks', { projectId: task.projectId })
    return { task }
  })
}
