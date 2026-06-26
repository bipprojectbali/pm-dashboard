import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { notifyTaskStatusChanged } from '../../lib/notifications'
import { emitInvalidate } from '../../lib/presence'
import { getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { AI_QUEUE_TAG, getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const
const STATUSES = ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const BULK_MAX = 100

type BulkBody = {
  ids?: string[]
  status?: (typeof STATUSES)[number]
  priority?: (typeof PRIORITIES)[number]
  assigneeId?: string | null
}

export function qcBulkRoutes() {
  return new Elysia().patch('/api/qc/tickets/bulk', async ({ request, set }) => {
    const auth = await requireAuth(request)
    if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
    if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
    const selfProject = await getSelfProject()
    if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }

    const body = (await request.json()) as BulkBody
    const ids = Array.from(new Set((body.ids ?? []).filter((id) => typeof id === 'string' && id)))
    if (!ids.length) { set.status = 400; return { error: 'ids wajib diisi (minimal 1 ticket)' } }
    if (ids.length > BULK_MAX) { set.status = 400; return { error: `Maksimal ${BULK_MAX} ticket per aksi` } }

    const hasStatus = body.status !== undefined
    const hasPriority = body.priority !== undefined
    const hasAssignee = body.assigneeId !== undefined
    if (!hasStatus && !hasPriority && !hasAssignee) {
      set.status = 400
      return { error: 'Minimal satu field (status/priority/assigneeId) harus diubah' }
    }
    if (hasStatus && !STATUSES.includes(body.status as never)) { set.status = 400; return { error: 'status tidak valid' } }
    if (hasPriority && !PRIORITIES.includes(body.priority as never)) { set.status = 400; return { error: 'priority tidak valid' } }

    if (hasAssignee && body.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } })
      if (!assignee) { set.status = 400; return { error: 'assignee tidak ditemukan' } }
    }

    const tickets = await prisma.task.findMany({
      where: {
        id: { in: ids },
        projectId: selfProject.id,
        tags: { some: { tag: { name: AI_QUEUE_TAG } } },
      },
      select: { id: true, status: true, title: true, reporterId: true, assigneeId: true },
    })
    if (!tickets.length) { set.status = 404; return { error: 'Tidak ada ticket cocok di self-project' } }

    const common: Record<string, unknown> = {}
    if (hasPriority) common.priority = body.priority
    if (hasAssignee) common.assigneeId = body.assigneeId ?? null

    const ops = tickets.map((t) => {
      const data: Record<string, unknown> = { ...common }
      if (hasStatus && body.status !== t.status) {
        data.status = body.status
        if (body.status === 'CLOSED') data.closedAt = new Date()
        if (t.status === 'CLOSED' && body.status !== 'CLOSED') data.closedAt = null
      }
      return prisma.task.update({ where: { id: t.id }, data })
    })
    const changes = tickets
      .filter((t) => hasStatus && body.status !== t.status)
      .map((t) =>
        prisma.taskStatusChange.create({
          data: { taskId: t.id, authorId: auth.userId, fromStatus: t.status, toStatus: body.status as never },
        }),
      )
    await prisma.$transaction([...ops, ...changes])

    if (hasStatus) {
      const changed = tickets.filter((t) => body.status !== t.status)
      if (changed.length) {
        const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
        for (const t of changed) {
          notifyTaskStatusChanged({
            taskId: t.id,
            projectId: selfProject.id,
            taskTitle: t.title,
            reporterId: t.reporterId,
            assigneeId: hasAssignee ? (body.assigneeId ?? null) : t.assigneeId,
            actorId: auth.userId,
            actorName: actor?.name ?? 'Someone',
            fromStatus: t.status,
            toStatus: body.status as never,
          }).catch(() => {})
        }
      }
    }

    const fields = [hasStatus && 'status', hasPriority && 'priority', hasAssignee && 'assignee'].filter(Boolean).join(',')
    writeAuditLog(auth.userId, 'QC_TICKET_BULK_UPDATED', `count=${tickets.length} fields=${fields}`, getIp(request))
    appLog('info', `QC bulk update: ${tickets.length} tickets (${fields}) by ${auth.email}`)
    emitInvalidate('qc')
    return { ok: true, updated: tickets.length, statusChanges: changes.length }
  })
}
