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
          'List QC tickets in the self-project tagged "ai-queue", optionally filtered by status/priority and a free-text query (q matches title/description/route, case-insensitive). Default order priority DESC, then createdAt DESC; override with sort + order.',
        inputSchema: {
          status: z
            .enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'])
            .optional()
            .describe('Filter by status.'),
          priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
          q: z.string().optional().describe('Free-text search on title/description/route (case-insensitive substring).'),
          sort: z.enum(['priority', 'created', 'updated', 'title']).optional().describe('Sort field. Default: priority then createdAt.'),
          order: z.enum(['asc', 'desc']).default('desc'),
          page: z.number().int().min(1).default(1).describe('1-based page number.'),
          limit: z.number().int().min(1).max(200).default(50).describe('Page size.'),
        },
      },
      async ({ status, priority, q, sort, order, page, limit }) => {
        const self = await getSelfProject()
        if (!self) return jsonText({ error: 'No self-project configured' })
        const sortKey = { priority: 'priority', created: 'createdAt', updated: 'updatedAt', title: 'title' } as const
        const sortField = sort ? sortKey[sort] : null
        const orderBy = sortField
          ? [{ [sortField]: order } as never]
          : [{ priority: 'desc' as const }, { createdAt: 'desc' as const }]
        const search = q?.trim()
        const where = {
          projectId: self.id,
          tags: { some: { tag: { name: AI_QUEUE_TAG } } },
          ...(status ? { status } : {}),
          ...(priority ? { priority } : {}),
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  { description: { contains: search, mode: 'insensitive' as const } },
                  { route: { contains: search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        }
        const [total, tickets] = await prisma.$transaction([
          prisma.task.count({ where }),
          prisma.task.findMany({
            where,
            include: {
              reporter: { select: { id: true, name: true, email: true } },
              assignee: { select: { id: true, name: true, email: true } },
              tags: { include: { tag: true } },
              _count: { select: { evidence: true, comments: true } },
            },
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
          }),
        ])
        return jsonText({ count: tickets.length, page, limit, total, totalPages: Math.ceil(total / limit), selfProject: self, tickets })
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
