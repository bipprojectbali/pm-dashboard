import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { AI_QUEUE_TAG, getSelfProject } from '../../../src/lib/self-project'
import { jsonText, type ToolModule } from './shared'
import { loadTicket } from './qc.helpers'

export const qcReadonly: ToolModule = {
  name: 'qc-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'qc_self_project_get',
      {
        title: 'Get QC self-project',
        description:
          'Return the project currently marked as the QC "self-project" (the meta project where QC tickets for pm-dashboard itself live), or null if none is configured.',
        inputSchema: {},
      },
      async () => {
        const self = await getSelfProject()
        return jsonText({ selfProject: self })
      },
    )

    server.registerTool(
      'qc_context',
      {
        title: 'QC dashboard context',
        description:
          'Return self-project + ticket status breakdown (open/in_progress/ready_for_qc/closed counts) — mirrors the /qc frontend context endpoint.',
        inputSchema: {},
      },
      async () => {
        const self = await getSelfProject()
        if (!self) return jsonText({ selfProject: null, stats: null })
        const groups = await prisma.task.groupBy({
          by: ['status'],
          where: { projectId: self.id, tags: { some: { tag: { name: AI_QUEUE_TAG } } } },
          _count: { _all: true },
        })
        const stats: Record<string, number> = {}
        for (const g of groups) stats[g.status] = g._count._all
        return jsonText({ selfProject: self, stats })
      },
    )

    server.registerTool(
      'qc_ticket_list',
      {
        title: 'List QC tickets',
        description:
          'List QC tickets in the self-project tagged "ai-queue", optionally filtered by status/priority. Ordered priority DESC, then createdAt DESC.',
        inputSchema: {
          status: z
            .enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'])
            .optional()
            .describe('Filter by status.'),
          priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ status, priority, limit }) => {
        const self = await getSelfProject()
        if (!self) return jsonText({ error: 'No self-project configured' })
        const tickets = await prisma.task.findMany({
          where: {
            projectId: self.id,
            tags: { some: { tag: { name: AI_QUEUE_TAG } } },
            ...(status ? { status } : {}),
            ...(priority ? { priority } : {}),
          },
          include: {
            reporter: { select: { id: true, name: true, email: true } },
            assignee: { select: { id: true, name: true, email: true } },
            tags: { include: { tag: true } },
            _count: { select: { evidence: true, comments: true } },
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          take: limit,
        })
        return jsonText({ count: tickets.length, selfProject: self, tickets })
      },
    )

    server.registerTool(
      'qc_ticket_get',
      {
        title: 'Get QC ticket',
        description:
          'Full detail of a QC ticket (must belong to the self-project): reporter, assignee, tags, evidence, comments, checklist, statusChanges.',
        inputSchema: { ticketId: z.string() },
      },
      async ({ ticketId }) => {
        const self = await getSelfProject()
        if (!self) return jsonText({ error: 'No self-project configured' })
        const ticket = await loadTicket(ticketId)
        if (!ticket || ticket.projectId !== self.id) return jsonText({ error: 'Ticket not found in self-project' })
        return jsonText({ ticket })
      },
    )
  },
}
