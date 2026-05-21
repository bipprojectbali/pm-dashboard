import { Elysia } from 'elysia'
import { prisma } from '../lib/db'
import { env } from '../lib/env'
import { appLog } from '../lib/applog'
import { emitInvalidate } from '../lib/presence'
import { notifyTaskAssigned, notifyTaskCommented, notifyTaskStatusChanged } from '../lib/notifications'
import {
  requireAuth,
  requireProjectMember,
  canReadProject,
  getIp,
  isSystemAdmin,
  getAllowedTaskTransitions,
  computeActualHours,
  computeProgressPercent,
} from '../lib/route-helpers'

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

interface TaskAwFocus {
  focusHours: number
  eventCount: number
  windowStart: string
  windowEnd: string
  topApps: Array<{ app: string; seconds: number }>
  topTitles: Array<{ app: string; title: string; seconds: number }>
  matchKeywords: string[]
  matchedHours: number | null
}

async function computeTaskAwFocus(task: {
  id: string
  title: string
  route: string | null
  assigneeId: string | null
  startsAt: Date | null
  createdAt: Date
  closedAt: Date | null
}): Promise<TaskAwFocus | null> {
  if (!task.assigneeId) return null
  const agents = await prisma.agent.findMany({
    where: { claimedById: task.assigneeId, status: 'APPROVED' },
    select: { id: true },
  })
  if (agents.length === 0) return null
  const windowStart = task.startsAt ?? task.createdAt
  const windowEnd = task.closedAt ?? new Date()
  if (windowEnd.getTime() <= windowStart.getTime()) return null
  const events = await prisma.activityEvent.findMany({
    where: {
      agentId: { in: agents.map((a) => a.id) },
      timestamp: { gte: windowStart, lte: windowEnd },
      bucketId: { startsWith: 'aw-watcher-window' },
    },
    select: { duration: true, data: true },
    take: 20_000,
  })
  if (events.length === 0) {
    return {
      focusHours: 0,
      eventCount: 0,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      topApps: [],
      topTitles: [],
      matchKeywords: [],
      matchedHours: null,
    }
  }
  const keywords = Array.from(
    new Set(
      [task.title, task.route ?? '']
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4),
    ),
  ).slice(0, 12)
  const appTotals = new Map<string, number>()
  const titleTotals = new Map<string, { app: string; title: string; seconds: number }>()
  let totalSeconds = 0
  let matchedSeconds = 0
  for (const e of events) {
    const d = (e.data ?? {}) as Record<string, unknown>
    const app = typeof d.app === 'string' ? d.app : null
    const title = typeof d.title === 'string' ? d.title : null
    if (!app) continue
    totalSeconds += e.duration
    appTotals.set(app, (appTotals.get(app) ?? 0) + e.duration)
    if (title) {
      const key = `${app}::${title}`
      const existing = titleTotals.get(key)
      if (existing) existing.seconds += e.duration
      else titleTotals.set(key, { app, title, seconds: e.duration })
      const combined = `${app} ${title}`.toLowerCase()
      if (keywords.some((kw) => combined.includes(kw))) matchedSeconds += e.duration
    }
  }
  const topApps = [...appTotals.entries()]
    .map(([app, seconds]) => ({ app, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8)
  const topTitles = [...titleTotals.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10)
  return {
    focusHours: Math.round((totalSeconds / 3600) * 100) / 100,
    eventCount: events.length,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    topApps,
    topTitles,
    matchKeywords: keywords,
    matchedHours: keywords.length > 0 ? Math.round((matchedSeconds / 3600) * 100) / 100 : null,
  }
}

export function tasksRoutes() {
  return new Elysia()
    .get('/api/tasks', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const isAdmin = isSystemAdmin(auth.role)
      const myProjectIds = (
        await prisma.projectMember.findMany({ where: { userId: auth.userId }, select: { projectId: true } })
      ).map((m) => m.projectId)
      const visibilityFilter = isAdmin
        ? {}
        : {
            project: {
              OR: [
                { id: { in: myProjectIds } },
                { visibility: 'INTERNAL' as const },
                { visibility: 'PUBLIC' as const },
              ],
            },
          }
      const where: Record<string, unknown> = { deletedAt: null, ...visibilityFilter }
      if (query.projectId) {
        if (!isAdmin) {
          const access = await canReadProject(String(query.projectId), auth)
          if (!access.ok) {
            set.status = access.status!
            return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
          }
        }
        where.projectId = String(query.projectId)
        delete where.project
      }
      const TASK_STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'] as const
      const TASK_KIND_VALUES = ['TASK', 'BUG', 'QC'] as const
      if (query.status) {
        const s = String(query.status)
        if (!(TASK_STATUS_VALUES as readonly string[]).includes(s)) {
          set.status = 400
          return { error: `status must be one of: ${TASK_STATUS_VALUES.join(', ')}` }
        }
        where.status = s
      }
      if (query.kind) {
        const k = String(query.kind)
        if (!(TASK_KIND_VALUES as readonly string[]).includes(k)) {
          set.status = 400
          return { error: `kind must be one of: ${TASK_KIND_VALUES.join(', ')}` }
        }
        where.kind = k
      }
      if (query.assigneeId) where.assigneeId = String(query.assigneeId)
      if (query.mine === '1') where.assigneeId = auth.userId
      if (query.tagId) where.tags = { some: { tagId: String(query.tagId) } }
      const tasks = await prisma.task.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
          assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
          tags: { include: { tag: true } },
          checklist: { select: { done: true } },
          blockedBy: { select: { blockedById: true } },
          _count: { select: { comments: true, evidence: true, blockedBy: true, blocks: true } },
        },
        orderBy: [{ status: 'asc' }, { kanbanOrder: 'asc' }, { createdAt: 'desc' }],
        take: Math.min(Number(query.limit) || 100, 500),
      })
      const enriched = tasks.map((t) => ({
        ...t,
        actualHours: computeActualHours(t),
        progressPercent: computeProgressPercent(t),
      }))
      return { tasks: enriched }
    })

    .post('/api/tasks/reorder', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      let body: { updates?: unknown }
      try { body = (await request.json()) as typeof body } catch { set.status = 400; return { error: 'Invalid JSON' } }
      if (!Array.isArray(body.updates) || body.updates.length === 0) {
        set.status = 400; return { error: 'updates array required' }
      }
      const updates = body.updates as Array<{ id: string; kanbanOrder: number; status?: string }>
      await Promise.all(updates.map((u) =>
        prisma.task.update({
          where: { id: u.id },
          data: {
            kanbanOrder: u.kanbanOrder,
            ...(u.status ? { status: u.status as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED' } : {}),
          },
        })
      ))
      return { ok: true }
    })

    .post('/api/tasks/bulk', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const body = (await request.json()) as {
        projectId?: string
        tasks?: Array<{
          title?: string; description?: string; kind?: string; priority?: string
          route?: string | null; assigneeEmail?: string | null
          startsAt?: string | null; dueAt?: string | null
          estimateHours?: number | null; tagNames?: string[]
        }>
      }
      if (!body.projectId || !Array.isArray(body.tasks) || body.tasks.length === 0) {
        set.status = 400; return { error: 'projectId dan tasks (array, ≥1) wajib' }
      }
      if (body.tasks.length > 500) { set.status = 400; return { error: 'Maksimum 500 task per import' } }
      const membership = await requireProjectMember(body.projectId, auth.userId)
      if (!isSystemAdmin(auth.role) && (!membership || membership.role === 'VIEWER')) {
        set.status = 403; return { error: 'Not a writable project member' }
      }
      if (!membership) {
        const exists = await prisma.project.findUnique({ where: { id: body.projectId }, select: { id: true } })
        if (!exists) { set.status = 404; return { error: 'Project not found' } }
      }
      const KINDS = new Set(['TASK', 'BUG', 'QC'])
      const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
      const errors: Array<{ index: number; field: string; message: string }> = []
      const emailSet = new Set<string>()
      const tagNameSet = new Set<string>()
      const normalizedRows: Array<{
        title: string; description: string
        kind: 'TASK' | 'BUG' | 'QC'; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
        route: string | null; assigneeEmail: string | null
        startsAt: Date | null; dueAt: Date | null
        estimateHours: number | null; tagNames: string[]
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
        if (!PRIORITIES.has(priority)) errors.push({ index: i, field: 'priority', message: 'priority harus LOW|MEDIUM|HIGH|CRITICAL' })
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
        if (startsAt && dueAt && dueAt < startsAt) errors.push({ index: i, field: 'dueAt', message: 'dueAt < startsAt' })
        let estimateHours: number | null = null
        if (r.estimateHours !== null && r.estimateHours !== undefined && r.estimateHours !== ('' as unknown)) {
          const n = typeof r.estimateHours === 'number' ? r.estimateHours : Number(r.estimateHours)
          if (!Number.isFinite(n) || n < 0) errors.push({ index: i, field: 'estimateHours', message: 'estimateHours harus angka ≥ 0' })
          else estimateHours = n
        }
        const assigneeEmail = r.assigneeEmail?.trim() || null
        if (assigneeEmail) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail)) errors.push({ index: i, field: 'assigneeEmail', message: 'assigneeEmail format invalid' })
          else emailSet.add(assigneeEmail)
        }
        const tagNames = Array.isArray(r.tagNames) ? r.tagNames.map((t) => String(t).trim()).filter(Boolean) : []
        for (const t of tagNames) tagNameSet.add(t)
        normalizedRows.push({ title, description, kind: kind as 'TASK' | 'BUG' | 'QC', priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', route: r.route?.trim() || null, assigneeEmail, startsAt, dueAt, estimateHours, tagNames })
      }
      const users = emailSet.size ? await prisma.user.findMany({ where: { email: { in: [...emailSet] } }, select: { id: true, email: true } }) : []
      const userByEmail = new Map(users.map((u) => [u.email, u.id]))
      for (let i = 0; i < normalizedRows.length; i++) {
        const e = normalizedRows[i].assigneeEmail
        if (e && !userByEmail.has(e)) errors.push({ index: i, field: 'assigneeEmail', message: `user not found: ${e}` })
      }
      const tagsByName = tagNameSet.size ? await prisma.tag.findMany({ where: { projectId: body.projectId, name: { in: [...tagNameSet] } }, select: { id: true, name: true } }) : []
      const tagIdByName = new Map(tagsByName.map((t) => [t.name, t.id]))
      for (let i = 0; i < normalizedRows.length; i++) {
        for (const tn of normalizedRows[i].tagNames) {
          if (!tagIdByName.has(tn)) errors.push({ index: i, field: 'tagNames', message: `tag not in project: ${tn}` })
        }
      }
      if (errors.length) { set.status = 400; return { error: 'Validation failed', errors } }
      const created = await prisma.$transaction(
        normalizedRows.map((r) =>
          prisma.task.create({
            data: {
              projectId: body.projectId!,
              kind: r.kind, title: r.title, description: r.description, priority: r.priority,
              route: r.route, reporterId: auth.userId,
              assigneeId: r.assigneeEmail ? (userByEmail.get(r.assigneeEmail) ?? null) : null,
              startsAt: r.startsAt, dueAt: r.dueAt, estimateHours: r.estimateHours,
              tags: r.tagNames.length ? { create: r.tagNames.map((n) => ({ tagId: tagIdByName.get(n)! })) } : undefined,
            },
          }),
        ),
      )
      audit(auth.userId, 'TASK_BULK_CREATED', `project=${body.projectId} count=${created.length}`, getIp(request))
      appLog('info', `Tasks bulk-created: ${created.length} on ${body.projectId} by ${auth.email}`)
      emitInvalidate('tasks', { projectId: body.projectId! })
      return { count: created.length, ids: created.map((t) => t.id) }
    })

    .post('/api/tasks', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const body = (await request.json()) as {
        projectId?: string; kind?: string; title?: string; description?: string
        priority?: string; route?: string; assigneeId?: string
        startsAt?: string; dueAt?: string; estimateHours?: number; tagIds?: string[]
      }
      if (!body.projectId || !body.title || !body.description) {
        set.status = 400; return { error: 'projectId, title, description wajib diisi' }
      }
      if (body.title.length > 500) { set.status = 400; return { error: 'Title must be 500 characters or fewer' } }
      const membership = await requireProjectMember(body.projectId, auth.userId)
      if (!isSystemAdmin(auth.role) && (!membership || membership.role === 'VIEWER')) {
        set.status = 403; return { error: 'Not a writable project member' }
      }
      if (!membership) {
        const exists = await prisma.project.findUnique({ where: { id: body.projectId }, select: { id: true } })
        if (!exists) { set.status = 404; return { error: 'Project not found' } }
      }
      if (body.tagIds?.length) {
        const validTags = await prisma.tag.findMany({ where: { id: { in: body.tagIds }, projectId: body.projectId }, select: { id: true } })
        if (validTags.length !== body.tagIds.length) { set.status = 400; return { error: 'One or more tagIds do not exist in this project' } }
      }
      const task = await prisma.task.create({
        data: {
          projectId: body.projectId,
          kind: (body.kind as 'TASK' | 'BUG' | 'QC') ?? 'TASK',
          title: body.title, description: body.description,
          priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
          route: body.route ?? null, reporterId: auth.userId, assigneeId: body.assigneeId ?? null,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          estimateHours: typeof body.estimateHours === 'number' ? body.estimateHours : null,
          tags: body.tagIds?.length ? { create: body.tagIds.map((tagId) => ({ tagId })) } : undefined,
        },
      })
      audit(auth.userId, 'TASK_CREATED', `#${task.id} ${task.title}`, getIp(request))
      appLog('info', `Task created: ${task.title} by ${auth.email}`)
      if (task.assigneeId && task.assigneeId !== auth.userId) {
        const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
        notifyTaskAssigned({ taskId: task.id, projectId: task.projectId, taskTitle: task.title, assigneeId: task.assigneeId, actorId: auth.userId, actorName: actor?.name ?? 'Someone' }).catch(() => {})
      }
      emitInvalidate('tasks', { projectId: task.projectId })
      return { task }
    })

    .get('/api/tasks/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const task = await prisma.task.findUnique({
        where: { id: params.id },
        include: {
          project: { select: { id: true, name: true } },
          reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
          assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
          comments: { include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } }, orderBy: { createdAt: 'asc' } },
          evidence: { orderBy: { createdAt: 'asc' } },
          tags: { include: { tag: true } },
          blockedBy: { include: { blockedBy: { select: { id: true, title: true, status: true, kind: true } } } },
          blocks: { include: { task: { select: { id: true, title: true, status: true, kind: true } } } },
          checklist: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
          statusChanges: { include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
        },
      })
      if (!task) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership && auth.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Not a project member' } }
      const actualHours = computeActualHours(task)
      const progressPercent = computeProgressPercent(task)
      const awFocus = await computeTaskAwFocus(task)
      return { task: { ...task, actualHours, progressPercent, awFocus } }
    })

    .patch('/api/tasks/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const current = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null } })
      if (!current) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(current.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const body = (await request.json()) as {
        title?: string; description?: string; priority?: string; kind?: string
        route?: string | null; status?: string; assigneeId?: string | null
        startsAt?: string | null; dueAt?: string | null
        estimateHours?: number | null; progressPercent?: number | null; tagIds?: string[]
      }
      if (body.title !== undefined && body.title.length > 500) { set.status = 400; return { error: 'Title must be 500 characters or fewer' } }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title
      if (body.description !== undefined) data.description = body.description
      if (body.priority !== undefined) data.priority = body.priority
      if (body.kind !== undefined) data.kind = body.kind
      if (body.route !== undefined) data.route = body.route
      if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId
      if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null
      if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null
      if (body.estimateHours !== undefined) data.estimateHours = body.estimateHours === null ? null : Number(body.estimateHours)
      if (body.progressPercent !== undefined) {
        const p = body.progressPercent
        data.progressPercent = p === null ? null : Math.max(0, Math.min(100, Math.round(p)))
      }
      let statusTransition: { from: string; to: string } | null = null
      if (body.status !== undefined) {
        const allowed = getAllowedTaskTransitions(current.status, current.kind)
        if (!allowed.includes(body.status)) { set.status = 400; return { error: `Invalid transition: ${current.status} → ${body.status} for ${current.kind}` } }
        if (body.status !== current.status) statusTransition = { from: current.status, to: body.status }
        data.status = body.status
        if (body.status === 'CLOSED') data.closedAt = new Date()
        if (body.status === 'REOPENED') data.closedAt = null
      }
      const task = await prisma.task.update({ where: { id: params.id }, data })
      if (statusTransition) {
        await prisma.taskStatusChange.create({
          data: {
            taskId: task.id, authorId: auth.userId,
            fromStatus: statusTransition.from as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED',
            toStatus: statusTransition.to as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED',
          },
        })
      }
      if (body.tagIds !== undefined) {
        await prisma.taskTag.deleteMany({ where: { taskId: task.id } })
        if (body.tagIds.length) await prisma.taskTag.createMany({ data: body.tagIds.map((tagId) => ({ taskId: task.id, tagId })), skipDuplicates: true })
      }
      audit(auth.userId, 'TASK_UPDATED', `#${task.id} ${Object.keys(data).join(',')}`, getIp(request))
      const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
      const actorName = actor?.name ?? 'Someone'
      if (body.assigneeId !== undefined && body.assigneeId && body.assigneeId !== current.assigneeId && body.assigneeId !== auth.userId) {
        notifyTaskAssigned({ taskId: task.id, projectId: task.projectId, taskTitle: task.title, assigneeId: body.assigneeId, actorId: auth.userId, actorName }).catch(() => {})
      }
      if (statusTransition) {
        notifyTaskStatusChanged({ taskId: task.id, projectId: task.projectId, taskTitle: task.title, reporterId: current.reporterId, assigneeId: task.assigneeId, actorId: auth.userId, actorName, fromStatus: statusTransition.from, toStatus: statusTransition.to }).catch(() => {})
      }
      emitInvalidate('tasks', { projectId: task.projectId })
      return { task }
    })

    .delete('/api/tasks/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const current = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null } })
      if (!current) { set.status = 404; return { error: 'Task not found' } }
      const isReporter = current.reporterId === auth.userId
      if (auth.role !== 'SUPER_ADMIN' && !isReporter) {
        const membership = await requireProjectMember(current.projectId, auth.userId)
        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'PM')) {
          set.status = 403; return { error: 'Only the reporter or project OWNER/PM can delete tasks' }
        }
      }
      const body = await request.json().catch(() => ({})) as { reason?: string }
      if (!body.reason || body.reason.trim().length < 3) {
        set.status = 400; return { error: 'Alasan penghapusan wajib diisi (min 3 karakter)' }
      }
      await prisma.task.update({
        where: { id: params.id },
        data: { deletedAt: new Date(), deletedById: auth.userId, deleteReason: body.reason.trim() },
      })
      audit(auth.userId, 'TASK_DELETED', `#${current.id} "${current.title}" — ${body.reason.trim()}`, getIp(request))
      appLog('info', `Task soft-deleted: #${current.id} by ${auth.userId}`)
      emitInvalidate('tasks', { projectId: current.projectId })
      return { ok: true }
    })

    .post('/api/tasks/bulk-delete', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const body = (await request.json().catch(() => null)) as { ids?: unknown; reason?: string } | null
      if (!body || !Array.isArray(body.ids) || body.ids.length === 0) { set.status = 400; return { error: 'ids[] required' } }
      if (!body.reason || body.reason.trim().length < 3) { set.status = 400; return { error: 'Alasan penghapusan wajib diisi (min 3 karakter)' } }
      const ids = body.ids.filter((v): v is string => typeof v === 'string').slice(0, 500)
      if (ids.length === 0) { set.status = 400; return { error: 'ids[] must contain non-empty strings' } }
      const candidates = await prisma.task.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, projectId: true, reporterId: true, title: true } })
      if (candidates.length === 0) return { deleted: 0, denied: 0, deniedIds: [] }
      const isSuper = auth.role === 'SUPER_ADMIN'
      let leadProjectIds: Set<string> | null = null
      if (!isSuper) {
        const lead = await prisma.projectMember.findMany({ where: { userId: auth.userId, projectId: { in: Array.from(new Set(candidates.map((c) => c.projectId))) }, role: { in: ['OWNER', 'PM'] } }, select: { projectId: true } })
        leadProjectIds = new Set(lead.map((m) => m.projectId))
      }
      const allowedIds: string[] = []
      const deniedIds: string[] = []
      for (const c of candidates) {
        if (isSuper || c.reporterId === auth.userId || leadProjectIds?.has(c.projectId)) allowedIds.push(c.id)
        else deniedIds.push(c.id)
      }
      if (allowedIds.length > 0) {
        const now = new Date()
        await prisma.task.updateMany({
          where: { id: { in: allowedIds } },
          data: { deletedAt: now, deletedById: auth.userId, deleteReason: body.reason.trim() },
        })
        audit(auth.userId, 'TASK_DELETED', `bulk: ${allowedIds.length} tasks — ${body.reason.trim()}`, getIp(request))
        appLog('info', `Bulk soft-delete: ${allowedIds.length} tasks by ${auth.userId}`)
        emitInvalidate('tasks')
      }
      return { deleted: allowedIds.length, denied: deniedIds.length, deniedIds }
    })

    .get('/api/tasks/trash', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const isAdmin = isSystemAdmin(auth.role)
      const where: Record<string, unknown> = { deletedAt: { not: null } }
      if (query.projectId) where.projectId = String(query.projectId)
      if (!isAdmin) {
        const myProjectIds = (await prisma.projectMember.findMany({ where: { userId: auth.userId }, select: { projectId: true } })).map((m) => m.projectId)
        where.project = { OR: [{ id: { in: myProjectIds } }, { visibility: 'INTERNAL' }, { visibility: 'PUBLIC' }] }
      }
      const tasks = await prisma.task.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
          assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
          deletedBy: { select: { id: true, name: true, email: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { deletedAt: 'desc' },
        take: Math.min(Number(query.limit) || 100, 500),
      })
      return { tasks }
    })

    .post('/api/tasks/:id/restore', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const current = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null } })
      if (!current || !current.deletedAt) { set.status = 404; return { error: 'Task not found in trash' } }
      const isReporter = current.reporterId === auth.userId
      if (auth.role !== 'SUPER_ADMIN' && !isReporter) {
        const membership = await requireProjectMember(current.projectId, auth.userId)
        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'PM')) {
          set.status = 403; return { error: 'Hanya reporter atau OWNER/PM yang bisa restore' }
        }
      }
      await prisma.task.update({
        where: { id: params.id },
        data: { deletedAt: null, deletedById: null, deleteReason: null },
      })
      audit(auth.userId, 'TASK_RESTORED', `#${current.id} "${current.title}"`, getIp(request))
      appLog('info', `Task restored: #${current.id} by ${auth.userId}`)
      emitInvalidate('tasks', { projectId: current.projectId })
      return { ok: true }
    })

    .delete('/api/tasks/:id/purge', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!isSystemAdmin(auth.role)) { set.status = 403; return { error: 'ADMIN atau SUPER_ADMIN only' } }
      const current = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null } })
      if (!current || !current.deletedAt) { set.status = 404; return { error: 'Task not found in trash' } }
      await prisma.task.delete({ where: { id: params.id } })
      audit(auth.userId, 'TASK_PURGED', `#${current.id} "${current.title}"`, getIp(request))
      appLog('info', `Task permanently purged: #${current.id} by ${auth.userId}`)
      return { ok: true }
    })

    .post('/api/tasks/:id/comments', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const task = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null }, select: { projectId: true, title: true, reporterId: true, assigneeId: true } })
      if (!task) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const { body: text } = (await request.json()) as { body?: string }
      if (!text?.trim()) { set.status = 400; return { error: 'body wajib diisi' } }
      const comment = await prisma.taskComment.create({
        data: { taskId: params.id, authorId: auth.userId, authorTag: membership.role, body: text },
        include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } },
      })
      const snippet = text.trim().length > 120 ? `${text.trim().slice(0, 120)}…` : text.trim()
      notifyTaskCommented({ taskId: params.id, projectId: task.projectId, taskTitle: task.title, reporterId: task.reporterId, assigneeId: task.assigneeId, actorId: auth.userId, actorName: comment.author?.name ?? 'Someone', commentSnippet: snippet }).catch(() => {})
      emitInvalidate('tasks', { projectId: task.projectId })
      return { comment }
    })

    .post('/api/tasks/:id/evidence', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const task = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null }, select: { projectId: true } })
      if (!task) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const body = (await request.json()) as { kind?: string; url?: string; note?: string }
      if (!body.kind || !body.url) { set.status = 400; return { error: 'kind dan url wajib diisi' } }
      const evidence = await prisma.taskEvidence.create({ data: { taskId: params.id, kind: body.kind, url: body.url, note: body.note ?? null } })
      emitInvalidate('tasks', { projectId: task.projectId })
      return { evidence }
    })

    .post('/api/tasks/:id/evidence/upload', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const task = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null }, select: { projectId: true } })
      if (!task) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const form = await request.formData()
      const file = form.get('file')
      const note = form.get('note')
      if (!(file instanceof File)) { set.status = 400; return { error: 'file wajib diupload (field name: file)' } }
      if (file.size === 0) { set.status = 400; return { error: 'File kosong' } }
      if (file.size > env.UPLOAD_MAX_BYTES) { set.status = 413; return { error: `File terlalu besar (max ${env.UPLOAD_MAX_BYTES} bytes)` } }
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const safeDir = path.resolve(env.UPLOADS_DIR, 'evidence', params.id)
      await fs.mkdir(safeDir, { recursive: true })
      const ext = path.extname(file.name).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, '')
      const storedName = `${crypto.randomUUID()}${ext}`
      const fullPath = path.join(safeDir, storedName)
      await Bun.write(fullPath, file)
      const mimeKind = file.type.startsWith('image/') ? 'SCREENSHOT' : file.type.startsWith('text/') || file.type === 'application/json' ? 'LOG' : 'FILE'
      const displayNote = [file.name, `${(file.size / 1024).toFixed(1)} KB`, file.type || 'unknown', note && typeof note === 'string' ? note : null].filter(Boolean).join(' · ')
      const evidence = await prisma.taskEvidence.create({ data: { taskId: params.id, kind: mimeKind, url: `/api/evidence/${storedName}?task=${params.id}`, note: displayNote } })
      audit(auth.userId, 'EVIDENCE_UPLOADED', `task=${params.id} file=${file.name} size=${file.size}`, getIp(request))
      emitInvalidate('tasks', { projectId: task.projectId })
      return { evidence }
    })

    .get('/api/evidence/:file', async ({ request, params, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const taskId = typeof query?.task === 'string' ? query.task : null
      if (!taskId) { set.status = 400; return { error: 'task param wajib' } }
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
      if (!task) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership && auth.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Not a project member' } }
      const path = await import('node:path')
      const safeName = params.file.replace(/[^a-zA-Z0-9._-]/g, '')
      const fullPath = path.resolve(env.UPLOADS_DIR, 'evidence', taskId, safeName)
      const rootDir = path.resolve(env.UPLOADS_DIR, 'evidence', taskId)
      if (!fullPath.startsWith(rootDir)) { set.status = 400; return { error: 'Invalid path' } }
      const file = Bun.file(fullPath)
      if (!(await file.exists())) { set.status = 404; return { error: 'File not found' } }
      return new Response(file)
    })

    .get('/api/projects/:id/tags', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) { set.status = access.status!; return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' } }
      const tags = await prisma.tag.findMany({ where: { projectId: params.id }, orderBy: { name: 'asc' } })
      return { tags }
    })

    .post('/api/projects/:id/tags', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const body = (await request.json()) as { name?: string; color?: string }
      if (!body.name?.trim()) { set.status = 400; return { error: 'name wajib diisi' } }
      const tag = await prisma.tag.create({ data: { projectId: params.id, name: body.name.trim(), color: body.color ?? 'blue' } }).catch((e: unknown) => { if ((e as { code?: string }).code === 'P2002') return null; throw e })
      if (!tag) { set.status = 409; return { error: 'Tag with that name already exists' } }
      audit(auth.userId, 'TAG_CREATED', `${params.id} ← ${tag.name}`, getIp(request))
      emitInvalidate('tags', { projectId: params.id })
      return { tag }
    })

    .patch('/api/tags/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const tag = await prisma.tag.findUnique({ where: { id: params.id } })
      if (!tag) { set.status = 404; return { error: 'Tag not found' } }
      const membership = await requireProjectMember(tag.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const body = (await request.json()) as { name?: string; color?: string }
      const data: Record<string, unknown> = {}
      if (body.name !== undefined) data.name = body.name.trim()
      if (body.color !== undefined) data.color = body.color
      const updated = await prisma.tag.update({ where: { id: params.id }, data })
      emitInvalidate('tags', { projectId: tag.projectId })
      return { tag: updated }
    })

    .delete('/api/tags/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const tag = await prisma.tag.findUnique({ where: { id: params.id } })
      if (!tag) { set.status = 404; return { error: 'Tag not found' } }
      const membership = await requireProjectMember(tag.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      await prisma.tag.delete({ where: { id: params.id } })
      audit(auth.userId, 'TAG_DELETED', `${tag.projectId} ← ${tag.name}`, getIp(request))
      emitInvalidate('tags', { projectId: tag.projectId })
      emitInvalidate('tasks', { projectId: tag.projectId })
      return { ok: true }
    })

    .post('/api/tasks/:id/dependencies', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const task = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null }, select: { projectId: true } })
      if (!task) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const body = (await request.json()) as { blockedById?: string }
      if (!body.blockedById) { set.status = 400; return { error: 'blockedById wajib diisi' } }
      if (body.blockedById === params.id) { set.status = 400; return { error: 'Task cannot block itself' } }
      const blocker = await prisma.task.findUnique({ where: { id: body.blockedById }, select: { projectId: true } })
      if (!blocker || blocker.projectId !== task.projectId) { set.status = 400; return { error: 'Blocker task must be in the same project' } }
      const visited = new Set<string>()
      const queue: string[] = [body.blockedById]
      while (queue.length) {
        const cur = queue.shift() as string
        if (visited.has(cur)) continue
        visited.add(cur)
        if (cur === params.id) { set.status = 400; return { error: 'Dependency would create a cycle' } }
        const parents = await prisma.taskDependency.findMany({ where: { taskId: cur }, select: { blockedById: true } })
        for (const p of parents) queue.push(p.blockedById)
      }
      const dep = await prisma.taskDependency.create({ data: { taskId: params.id, blockedById: body.blockedById } }).catch((e: unknown) => { if ((e as { code?: string }).code === 'P2002') return null; throw e })
      if (!dep) { set.status = 409; return { error: 'Dependency already exists' } }
      emitInvalidate('tasks', { projectId: task.projectId })
      return { dependency: dep }
    })

    .delete('/api/tasks/:id/dependencies/:blockedById', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const task = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null }, select: { projectId: true } })
      if (!task) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      await prisma.taskDependency.delete({ where: { taskId_blockedById: { taskId: params.id, blockedById: params.blockedById } } })
      emitInvalidate('tasks', { projectId: task.projectId })
      return { ok: true }
    })

    .post('/api/tasks/:id/checklist', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const task = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null }, select: { projectId: true } })
      if (!task) { set.status = 404; return { error: 'Task not found' } }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const body = (await request.json()) as { title?: string }
      if (!body.title?.trim()) { set.status = 400; return { error: 'title wajib diisi' } }
      const last = await prisma.taskChecklistItem.findFirst({ where: { taskId: params.id }, orderBy: { order: 'desc' }, select: { order: true } })
      const item = await prisma.taskChecklistItem.create({ data: { taskId: params.id, title: body.title.trim(), order: (last?.order ?? -1) + 1 } })
      emitInvalidate('tasks', { projectId: task.projectId })
      return { item }
    })

    .patch('/api/checklist/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const existing = await prisma.taskChecklistItem.findUnique({ where: { id: params.id }, include: { task: { select: { projectId: true } } } })
      if (!existing) { set.status = 404; return { error: 'Checklist item not found' } }
      const membership = await requireProjectMember(existing.task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      const body = (await request.json()) as { title?: string; done?: boolean; order?: number }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title.trim()
      if (body.done !== undefined) data.done = body.done
      if (body.order !== undefined) data.order = body.order
      const item = await prisma.taskChecklistItem.update({ where: { id: params.id }, data })
      emitInvalidate('tasks', { projectId: existing.task.projectId })
      return { item }
    })

    .delete('/api/checklist/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const existing = await prisma.taskChecklistItem.findUnique({ where: { id: params.id }, include: { task: { select: { projectId: true } } } })
      if (!existing) { set.status = 404; return { error: 'Checklist item not found' } }
      const membership = await requireProjectMember(existing.task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') { set.status = 403; return { error: 'Not a writable project member' } }
      await prisma.taskChecklistItem.delete({ where: { id: params.id } })
      emitInvalidate('tasks', { projectId: existing.task.projectId })
      return { ok: true }
    })
}
