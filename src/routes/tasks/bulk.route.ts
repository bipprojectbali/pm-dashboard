import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getPermissionRule, meetsMinProjectRole } from '../../lib/permission-config'
import { getIp, isSystemAdmin, requireAuth, requireProjectMember, writeAuditLog } from '../../lib/route-helpers'

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
      const body = (await request.json()) as {
        projectId?: string
        tasks?: Array<{
          title?: string
          description?: string
          kind?: string
          priority?: string
          route?: string | null
          assigneeEmail?: string | null
          startsAt?: string | null
          dueAt?: string | null
          estimateHours?: number | null
          tagNames?: string[]
          phaseName?: string | null
        }>
      }
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
      const KINDS = new Set(['TASK', 'BUG', 'QC'])
      const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
      const errors: Array<{ index: number; field: string; message: string }> = []
      const emailSet = new Set<string>()
      const tagNameSet = new Set<string>()
      const phaseNameSet = new Set<string>()
      const normalizedRows: Array<{
        title: string
        description: string
        kind: 'TASK' | 'BUG' | 'QC'
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
        route: string | null
        assigneeEmail: string | null
        startsAt: Date | null
        dueAt: Date | null
        estimateHours: number | null
        tagNames: string[]
        phaseName: string | null
      }> = []
      for (let i = 0; i < body.tasks.length; i++) {
        const r = body.tasks[i]
        const title = typeof r.title === 'string' ? r.title.trim() : ''
        const description = typeof r.description === 'string' ? r.description.trim() : ''
        if (!title) errors.push({ index: i, field: 'title', message: 'title wajib diisi' })
        else if (title.length > 500) errors.push({ index: i, field: 'title', message: 'title > 500 char' })
        if (!description) errors.push({ index: i, field: 'description', message: 'description wajib diisi' })
        const kind = (r.kind ?? 'TASK').toUpperCase()
        if (!KINDS.has(kind)) errors.push({ index: i, field: 'kind', message: 'kind harus TASK|BUG|QC' })
        const priority = (r.priority ?? 'MEDIUM').toUpperCase()
        if (!PRIORITIES.has(priority))
          errors.push({ index: i, field: 'priority', message: 'priority harus LOW|MEDIUM|HIGH|CRITICAL' })
        let startsAt: Date | null = null
        if (r.startsAt) {
          const d = new Date(r.startsAt)
          if (Number.isNaN(d.getTime())) errors.push({ index: i, field: 'startsAt', message: 'startsAt invalid date' })
          else startsAt = d
        }
        let dueAt: Date | null = null
        if (r.dueAt) {
          const d = new Date(r.dueAt)
          if (Number.isNaN(d.getTime())) errors.push({ index: i, field: 'dueAt', message: 'dueAt invalid date' })
          else dueAt = d
        }
        if (startsAt && dueAt && dueAt < startsAt)
          errors.push({ index: i, field: 'dueAt', message: 'dueAt < startsAt' })
        let estimateHours: number | null = null
        if (r.estimateHours !== null && r.estimateHours !== undefined && r.estimateHours !== ('' as unknown)) {
          const n = typeof r.estimateHours === 'number' ? r.estimateHours : Number(r.estimateHours)
          if (!Number.isFinite(n) || n < 0)
            errors.push({ index: i, field: 'estimateHours', message: 'estimateHours harus angka ≥ 0' })
          else estimateHours = n
        }
        const assigneeEmail = r.assigneeEmail?.trim() || null
        if (assigneeEmail) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail))
            errors.push({ index: i, field: 'assigneeEmail', message: 'assigneeEmail format invalid' })
          else emailSet.add(assigneeEmail)
        }
        const tagNames = Array.isArray(r.tagNames) ? r.tagNames.map((t) => String(t).trim()).filter(Boolean) : []
        for (const t of tagNames) tagNameSet.add(t)
        const phaseName = r.phaseName?.trim() || null
        if (phaseName) phaseNameSet.add(phaseName)
        normalizedRows.push({
          title,
          description,
          kind: kind as 'TASK' | 'BUG' | 'QC',
          priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
          route: r.route?.trim() || null,
          assigneeEmail,
          startsAt,
          dueAt,
          estimateHours,
          tagNames,
          phaseName,
        })
      }
      const users = emailSet.size
        ? await prisma.user.findMany({ where: { email: { in: [...emailSet] } }, select: { id: true, email: true } })
        : []
      const userByEmail = new Map(users.map((u) => [u.email, u.id]))
      for (let i = 0; i < normalizedRows.length; i++) {
        const e = normalizedRows[i].assigneeEmail
        if (e && !userByEmail.has(e)) errors.push({ index: i, field: 'assigneeEmail', message: `user not found: ${e}` })
      }
      const tagsByName = tagNameSet.size
        ? await prisma.tag.findMany({
            where: { projectId: body.projectId, name: { in: [...tagNameSet] } },
            select: { id: true, name: true },
          })
        : []
      const tagIdByName = new Map(tagsByName.map((t) => [t.name, t.id]))
      for (let i = 0; i < normalizedRows.length; i++) {
        for (const tn of normalizedRows[i].tagNames) {
          if (!tagIdByName.has(tn)) errors.push({ index: i, field: 'tagNames', message: `tag not in project: ${tn}` })
        }
      }
      const phasesByName = phaseNameSet.size
        ? await prisma.projectPhase.findMany({
            where: { projectId: body.projectId, title: { in: [...phaseNameSet] } },
            select: { id: true, title: true },
          })
        : []
      const phaseIdByName = new Map(phasesByName.map((p) => [p.title, p.id]))
      if (errors.length) {
        set.status = 400
        return { error: 'Validation failed', errors }
      }
      const created = await prisma.$transaction(
        normalizedRows.map((r) =>
          prisma.task.create({
            data: {
              projectId: body.projectId!,
              kind: r.kind,
              title: r.title,
              description: r.description,
              priority: r.priority,
              route: r.route,
              reporterId: auth.userId,
              assigneeId: r.assigneeEmail ? (userByEmail.get(r.assigneeEmail) ?? null) : null,
              startsAt: r.startsAt,
              dueAt: r.dueAt,
              estimateHours: r.estimateHours,
              phaseId: r.phaseName ? (phaseIdByName.get(r.phaseName) ?? null) : null,
              tags: r.tagNames.length ? { create: r.tagNames.map((n) => ({ tagId: tagIdByName.get(n)! })) } : undefined,
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
