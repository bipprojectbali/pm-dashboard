import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getPermissionRule, meetsMinProjectRole } from '../../lib/permission-config'
import { getIp, isSystemAdmin, requireAuth, requireProjectMember, writeAuditLog } from '../../lib/route-helpers'
import { normalizeBulkRows, resolveBulkRefs } from './bulk.helpers'
import type { RawTaskInput } from './bulk.helpers'

export function taskBulkRoutes() {
  return new Elysia()
    .post('/api/tasks/reorder', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      let body: { updates?: unknown }
      try {
        body = (await request.json()) as typeof body
      } catch {
        set.status = 400
        return { error: 'Invalid JSON' }
      }
      if (!Array.isArray(body.updates) || body.updates.length === 0) {
        set.status = 400
        return { error: 'updates array required' }
      }
      const updates = body.updates as Array<{ id: string; kanbanOrder: number; status?: string }>
      const firstTask = await prisma.task.findUnique({
        where: { id: updates[0].id, deletedAt: null },
        select: { projectId: true },
      })
      if (!firstTask) {
        set.status = 404
        return { error: 'Task not found' }
      }
      const reorderMembership = await requireProjectMember(firstTask.projectId, auth.userId)
      if (!isSystemAdmin(auth.role)) {
        const minWriteRoles = await getPermissionRule('permissions.task.write.minProjectRole')
        if (!reorderMembership || !meetsMinProjectRole(reorderMembership.role, minWriteRoles)) {
          set.status = 403
          return { error: 'Not a writable project member' }
        }
      }
      await Promise.all(
        updates.map((u) =>
          prisma.task.update({
            where: { id: u.id },
            data: {
              kanbanOrder: u.kanbanOrder,
              ...(u.status
                ? { status: u.status as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED' }
                : {}),
            },
          }),
        ),
      )
      return { ok: true }
    })

    .post('/api/tasks/bulk', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const body = (await request.json()) as { projectId?: string; tasks?: RawTaskInput[] }
      if (!body.projectId || !Array.isArray(body.tasks) || body.tasks.length === 0) {
        set.status = 400
        return { error: 'projectId dan tasks (array, ≥1) wajib' }
      }
      if (body.tasks.length > 500) {
        set.status = 400
        return { error: 'Maksimum 500 task per import' }
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
      const { normalized, errors: rowErrors, emailSet, tagNameSet, phaseNameSet } = normalizeBulkRows(body.tasks)
      const refs = await resolveBulkRefs(body.projectId, emailSet, tagNameSet, phaseNameSet, normalized)
      const allErrors = [...rowErrors, ...refs.errors]
      if (allErrors.length) {
        set.status = 400
        return { error: 'Validation failed', errors: allErrors }
      }
      const created = await prisma.$transaction(
        normalized.map((r) =>
          prisma.task.create({
            data: {
              projectId: body.projectId!,
              kind: r.kind,
              title: r.title,
              description: r.description,
              priority: r.priority,
              route: r.route,
              reporterId: auth.userId,
              assigneeId: r.assigneeEmail ? (refs.userByEmail.get(r.assigneeEmail) ?? null) : null,
              startsAt: r.startsAt,
              dueAt: r.dueAt,
              estimateHours: r.estimateHours,
              phaseId: r.phaseName ? (refs.phaseIdByName.get(r.phaseName) ?? null) : null,
              tags: r.tagNames.length
                ? { create: r.tagNames.map((n) => ({ tagId: refs.tagIdByName.get(n)! })) }
                : undefined,
            },
          }),
        ),
      )
      writeAuditLog(auth.userId, 'TASK_BULK_CREATED', `project=${body.projectId} count=${created.length}`, getIp(request))
      appLog('info', `Tasks bulk-created: ${created.length} on ${body.projectId} by ${auth.email}`)
      emitInvalidate('tasks', { projectId: body.projectId! })
      return { count: created.length, ids: created.map((t) => t.id) }
    })
}
