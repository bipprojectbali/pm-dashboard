import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { notifyTaskAssigned, notifyTaskStatusChanged } from '../../lib/notifications'
import { emitInvalidate } from '../../lib/presence'
import { getPermissionRule, meetsMinProjectRole } from '../../lib/permission-config'
import {
  computeActualHours,
  computeProgressPercent,
  getAllowedTaskTransitions,
  getIp,
  isSystemAdmin,
  requireAuth,
  requireProjectMember,
  writeAuditLog,
} from '../../lib/route-helpers'

export function taskCrudRoutes() {
  return new Elysia()
    .post('/api/tasks', async ({ request, set }) => {
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
          kind: (body.kind as 'TASK' | 'BUG' | 'QC') ?? 'TASK',
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
        }).catch(() => {})
      }
      emitInvalidate('tasks', { projectId: task.projectId })
      return { task }
    })

    .get('/api/tasks/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const task = await prisma.task.findUnique({
        where: { id: params.id },
        include: {
          project: { select: { id: true, name: true } },
          reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
          assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
          comments: {
            include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } },
            orderBy: { createdAt: 'asc' },
          },
          evidence: { orderBy: { createdAt: 'asc' } },
          tags: { include: { tag: true } },
          blockedBy: { include: { blockedBy: { select: { id: true, title: true, status: true, kind: true } } } },
          blocks: { include: { task: { select: { id: true, title: true, status: true, kind: true } } } },
          checklist: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
          statusChanges: {
            include: { author: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!task) {
        set.status = 404
        return { error: 'Task not found' }
      }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Not a project member' }
      }
      const actualHours = computeActualHours(task)
      const progressPercent = computeProgressPercent(task)
      return { task: { ...task, actualHours, progressPercent } }
    })

    .patch('/api/tasks/:id', async ({ request, params, set }) => {
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
      const body = (await request.json()) as {
        title?: string
        description?: string
        priority?: string
        kind?: string
        route?: string | null
        status?: string
        assigneeId?: string | null
        startsAt?: string | null
        dueAt?: string | null
        estimateHours?: number | null
        progressPercent?: number | null
        tagIds?: string[]
        phaseId?: string | null
      }
      if (body.title !== undefined && body.title.length > 500) {
        set.status = 400
        return { error: 'Title must be 500 characters or fewer' }
      }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title
      if (body.description !== undefined) data.description = body.description
      if (body.priority !== undefined) data.priority = body.priority
      if (body.kind !== undefined) data.kind = body.kind
      if (body.route !== undefined) data.route = body.route
      if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId
      if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null
      if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null
      if (body.estimateHours !== undefined)
        data.estimateHours = body.estimateHours === null ? null : Number(body.estimateHours)
      if (body.progressPercent !== undefined) {
        const p = body.progressPercent
        data.progressPercent = p === null ? null : Math.max(0, Math.min(100, Math.round(p)))
      }
      if (body.phaseId !== undefined) data.phaseId = body.phaseId
      let statusTransition: { from: string; to: string } | null = null
      if (body.status !== undefined) {
        const allowed = getAllowedTaskTransitions(current.status, current.kind)
        if (!allowed.includes(body.status)) {
          set.status = 400
          return { error: `Invalid transition: ${current.status} → ${body.status} for ${current.kind}` }
        }
        if (body.status !== current.status) statusTransition = { from: current.status, to: body.status }
        data.status = body.status
        if (body.status === 'CLOSED') data.closedAt = new Date()
        if (body.status === 'REOPENED') data.closedAt = null
      }
      const task = await prisma.task.update({ where: { id: params.id }, data })
      if (statusTransition) {
        await prisma.taskStatusChange.create({
          data: {
            taskId: task.id,
            authorId: auth.userId,
            fromStatus: statusTransition.from as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED',
            toStatus: statusTransition.to as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED',
          },
        })
      }
      if (body.tagIds !== undefined) {
        await prisma.taskTag.deleteMany({ where: { taskId: task.id } })
        if (body.tagIds.length)
          await prisma.taskTag.createMany({
            data: body.tagIds.map((tagId) => ({ taskId: task.id, tagId })),
            skipDuplicates: true,
          })
      }
      writeAuditLog(auth.userId, 'TASK_UPDATED', `#${task.id} ${Object.keys(data).join(',')}`, getIp(request))
      const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
      const actorName = actor?.name ?? 'Someone'
      if (
        body.assigneeId !== undefined &&
        body.assigneeId &&
        body.assigneeId !== current.assigneeId &&
        body.assigneeId !== auth.userId
      ) {
        notifyTaskAssigned({
          taskId: task.id,
          projectId: task.projectId,
          taskTitle: task.title,
          assigneeId: body.assigneeId,
          actorId: auth.userId,
          actorName,
        }).catch(() => {})
      }
      if (statusTransition) {
        notifyTaskStatusChanged({
          taskId: task.id,
          projectId: task.projectId,
          taskTitle: task.title,
          reporterId: current.reporterId,
          assigneeId: task.assigneeId,
          actorId: auth.userId,
          actorName,
          fromStatus: statusTransition.from,
          toStatus: statusTransition.to,
        }).catch(() => {})
      }
      emitInvalidate('tasks', { projectId: task.projectId })
      return { task }
    })
}
