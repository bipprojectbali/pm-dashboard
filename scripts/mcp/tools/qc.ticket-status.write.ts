import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { AI_QUEUE_TAG, getSelfProject } from '../../../src/lib/self-project'
import { jsonText } from './shared'
import { audit } from './qc.helpers'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerQcTicketStatusTools(server: McpServer) {
  server.registerTool(
    'qc_ticket_update',
    {
      title: 'Update QC ticket',
      description:
        'Update title/description/priority/route/status on a QC ticket. Status change writes a TaskStatusChange row. actorEmail (optional) is stamped on status-change rows.',
      inputSchema: {
        ticketId: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED']).optional(),
        route: z.string().nullable().optional(),
        actorEmail: z.string().email().optional(),
      },
    },
    async ({ ticketId, title, description, priority, status, route, actorEmail }) => {
      const self = await getSelfProject()
      if (!self) return jsonText({ error: 'No self-project configured' })
      const existing = await prisma.task.findFirst({
        where: { id: ticketId, projectId: self.id },
        select: { id: true, status: true },
      })
      if (!existing) return jsonText({ error: 'Ticket not found in self-project' })
      let actorId: string | null = null
      if (actorEmail) {
        const u = await prisma.user.findUnique({ where: { email: actorEmail }, select: { id: true } })
        if (!u) return jsonText({ error: `Actor not found: ${actorEmail}` })
        actorId = u.id
      }
      const data: Record<string, unknown> = {}
      if (title !== undefined) data.title = title
      if (description !== undefined) data.description = description
      if (priority !== undefined) data.priority = priority
      if (route !== undefined) data.route = route
      const statusChanged = status !== undefined && status !== existing.status
      if (statusChanged) {
        data.status = status
        if (status === 'CLOSED') data.closedAt = new Date()
      }
      if (!Object.keys(data).length) return jsonText({ error: 'Nothing to update' })
      const ticket = await prisma.task.update({ where: { id: ticketId }, data })
      if (statusChanged) {
        await prisma.taskStatusChange.create({
          data: { taskId: ticket.id, authorId: actorId, fromStatus: existing.status, toStatus: status! },
        })
      }
      await audit(actorId, 'MCP_QC_TICKET_UPDATED', `#${ticket.id} ${Object.keys(data).join(',')}`)
      return jsonText({ ok: true, ticket })
    },
  )

  server.registerTool(
    'qc_ticket_bulk_update',
    {
      title: 'Bulk update QC tickets',
      description:
        'Apply the same status/priority/assignee change to many QC tickets at once (max 100). Only tickets in the self-project tagged "ai-queue" are touched; others are silently skipped. Status changes write TaskStatusChange rows. At least one of status/priority/assigneeEmail must be provided. assigneeEmail="" or null clears the assignee. actorEmail (optional) is stamped on status-change rows.',
      inputSchema: {
        ticketIds: z.array(z.string()).min(1).max(100),
        status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED']).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        assigneeEmail: z.string().nullable().optional().describe('User email to assign, or "" / null to unassign.'),
        actorEmail: z.string().email().optional(),
      },
    },
    async ({ ticketIds, status, priority, assigneeEmail, actorEmail }) => {
      const self = await getSelfProject()
      if (!self) return jsonText({ error: 'No self-project configured' })
      const hasStatus = status !== undefined
      const hasPriority = priority !== undefined
      const hasAssignee = assigneeEmail !== undefined
      if (!hasStatus && !hasPriority && !hasAssignee) {
        return jsonText({ error: 'At least one of status/priority/assigneeEmail must be provided' })
      }
      let actorId: string | null = null
      if (actorEmail) {
        const u = await prisma.user.findUnique({ where: { email: actorEmail }, select: { id: true } })
        if (!u) return jsonText({ error: `Actor not found: ${actorEmail}` })
        actorId = u.id
      }
      let assigneeId: string | null = null
      if (hasAssignee && assigneeEmail) {
        const a = await prisma.user.findUnique({ where: { email: assigneeEmail }, select: { id: true } })
        if (!a) return jsonText({ error: `Assignee not found: ${assigneeEmail}` })
        assigneeId = a.id
      }
      const ids = Array.from(new Set(ticketIds.filter(Boolean)))
      const tickets = await prisma.task.findMany({
        where: { id: { in: ids }, projectId: self.id, tags: { some: { tag: { name: AI_QUEUE_TAG } } } },
        select: { id: true, status: true },
      })
      if (!tickets.length) return jsonText({ error: 'No matching tickets in self-project' })
      const common: Record<string, unknown> = {}
      if (hasPriority) common.priority = priority
      if (hasAssignee) common.assigneeId = assigneeId
      const ops = tickets.map((t) => {
        const data: Record<string, unknown> = { ...common }
        if (hasStatus && status !== t.status) {
          data.status = status
          if (status === 'CLOSED') data.closedAt = new Date()
          if (t.status === 'CLOSED' && status !== 'CLOSED') data.closedAt = null
        }
        return prisma.task.update({ where: { id: t.id }, data })
      })
      const changes = tickets
        .filter((t) => hasStatus && status !== t.status)
        .map((t) =>
          prisma.taskStatusChange.create({
            data: { taskId: t.id, authorId: actorId, fromStatus: t.status, toStatus: status! },
          }),
        )
      await prisma.$transaction([...ops, ...changes])
      const fields = [hasStatus && 'status', hasPriority && 'priority', hasAssignee && 'assignee']
        .filter(Boolean)
        .join(',')
      await audit(actorId, 'MCP_QC_TICKET_BULK_UPDATED', `count=${tickets.length} fields=${fields}`)
      appLog('info', `MCP: QC bulk update ${tickets.length} tickets (${fields})`)
      return jsonText({ ok: true, updated: tickets.length, statusChanges: changes.length })
    },
  )
}
