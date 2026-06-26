import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { notifyTaskStatusChanged } from '../../lib/notifications'
import { emitInvalidate } from '../../lib/presence'
import { getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const

export function qcUpdateRoutes() {
  return new Elysia()

    .patch('/api/qc/tickets/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }
      const existing = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true, status: true, title: true, reporterId: true, assigneeId: true },
      })
      if (!existing) { set.status = 404; return { error: 'Ticket not found' } }
      const body = (await request.json()) as {
        title?: string
        description?: string
        priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
        status?: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
        route?: string | null
        assigneeId?: string | null
      }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title
      if (body.description !== undefined) data.description = body.description
      if (body.priority !== undefined) data.priority = body.priority
      if (body.route !== undefined) data.route = body.route
      if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId ?? null
      if (body.status !== undefined && body.status !== existing.status) {
        data.status = body.status
        if (body.status === 'CLOSED') data.closedAt = new Date()
      }
      const ticket = await prisma.task.update({ where: { id: params.id }, data })
      if (body.status !== undefined && body.status !== existing.status) {
        await prisma.taskStatusChange.create({
          data: { taskId: ticket.id, authorId: auth.userId, fromStatus: existing.status, toStatus: body.status },
        })
        const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
        notifyTaskStatusChanged({
          taskId: ticket.id,
          projectId: ticket.projectId,
          taskTitle: ticket.title,
          reporterId: existing.reporterId,
          assigneeId: ticket.assigneeId,
          actorId: auth.userId,
          actorName: actor?.name ?? 'Someone',
          fromStatus: existing.status,
          toStatus: body.status,
        }).catch(() => {})
      }
      writeAuditLog(auth.userId, 'QC_TICKET_UPDATED', `#${ticket.id}`, getIp(request))
      emitInvalidate('qc')
      return { ticket }
    })

    .delete('/api/qc/tickets/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (auth.role !== 'ADMIN' && auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Hanya ADMIN / SUPER_ADMIN yang bisa menghapus ticket' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }
      const exists = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true, title: true },
      })
      if (!exists) { set.status = 404; return { error: 'Ticket not found' } }
      await prisma.task.delete({ where: { id: params.id } })
      writeAuditLog(auth.userId, 'QC_TICKET_DELETED', `#${exists.id} "${exists.title}"`, getIp(request))
      appLog('info', `QC ticket deleted: #${exists.id} by ${auth.email}`)
      emitInvalidate('qc')
      return { ok: true }
    })
}
