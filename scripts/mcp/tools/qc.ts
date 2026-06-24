import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import {
  AI_QUEUE_TAG,
  clearSelfProject,
  ensureAiQueueTag,
  getSelfProject,
  setSelfProject,
} from '../../../src/lib/self-project'
import { jsonText, type ToolModule } from './shared'

async function audit(userId: string | null, action: string, detail: string | null) {
  await prisma.auditLog.create({ data: { userId, action, detail, ip: 'mcp' } }).catch(() => {})
}

async function loadTicket(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true, githubRepo: true, isSelf: true } },
      reporter: { select: { id: true, name: true, email: true, role: true } },
      assignee: { select: { id: true, name: true, email: true, role: true } },
      tags: { include: { tag: true } },
      evidence: { orderBy: { createdAt: 'asc' } },
      comments: {
        include: { author: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      checklist: { orderBy: { order: 'asc' } },
      statusChanges: {
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

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

export const qcTools: ToolModule = {
  name: 'qc',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'qc_self_project_set',
      {
        title: 'Set QC self-project',
        description:
          'Mark one project as the QC self-project (atomic swap: clears any previous self-project, sets this one, and upserts the "ai-queue" tag on it). Super-admin action.',
        inputSchema: { projectId: z.string() },
      },
      async ({ projectId }) => {
        const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
        if (!exists) return jsonText({ error: `Project not found: ${projectId}` })
        const project = await setSelfProject(projectId)
        await audit(null, 'MCP_QC_SELF_PROJECT_SET', `${project.id} ${project.name}`)
        appLog('info', `MCP: self-project set → ${project.name} (${project.id})`)
        return jsonText({ ok: true, selfProject: project })
      },
    )

    server.registerTool(
      'qc_self_project_clear',
      {
        title: 'Clear QC self-project',
        description: 'Unset the QC self-project flag everywhere. Does not delete any project or tickets.',
        inputSchema: {},
      },
      async () => {
        const result = await clearSelfProject()
        await audit(null, 'MCP_QC_SELF_PROJECT_CLEARED', `count=${result.count}`)
        appLog('info', `MCP: self-project cleared (affected ${result.count})`)
        return jsonText({ ok: true, cleared: result.count })
      },
    )

    server.registerTool(
      'qc_ticket_create',
      {
        title: 'Create QC ticket',
        description:
          'Create a QC ticket (kind=BUG) in the self-project. Auto-applies the "ai-queue" tag so Claude can pick it up. reporterEmail must exist as a User.',
        inputSchema: {
          title: z.string().min(1),
          description: z.string().min(1),
          reporterEmail: z.string().email(),
          priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
          route: z.string().optional().describe('Frontend route where the bug was observed, e.g. "/admin".'),
          evidenceUrls: z.array(z.string().url()).optional(),
        },
      },
      async ({ title, description, reporterEmail, priority, route, evidenceUrls }) => {
        const self = await getSelfProject()
        if (!self) return jsonText({ error: 'No self-project configured' })
        const reporter = await prisma.user.findUnique({
          where: { email: reporterEmail },
          select: { id: true, name: true },
        })
        if (!reporter) return jsonText({ error: `Reporter not found: ${reporterEmail}` })
        const tag = await ensureAiQueueTag(self.id)
        const ticket = await prisma.task.create({
          data: {
            projectId: self.id,
            kind: 'BUG',
            title: title.trim(),
            description: description.trim(),
            priority,
            route: route ?? null,
            reporterId: reporter.id,
            tags: { create: [{ tagId: tag.id }] },
            evidence: evidenceUrls?.length
              ? { create: evidenceUrls.map((url) => ({ url, kind: 'LINK' })) }
              : undefined,
          },
        })
        await audit(reporter.id, 'MCP_QC_TICKET_CREATED', `#${ticket.id} ${ticket.title}`)
        appLog('info', `MCP: QC ticket created #${ticket.id} by ${reporterEmail}`)
        return jsonText({ ok: true, ticket })
      },
    )

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
      'qc_ticket_comment',
      {
        title: 'Comment on QC ticket',
        description: 'Post a comment on a QC ticket. authorEmail must exist as a User.',
        inputSchema: {
          ticketId: z.string(),
          body: z.string().min(1),
          authorEmail: z.string().email(),
        },
      },
      async ({ ticketId, body, authorEmail }) => {
        const self = await getSelfProject()
        if (!self) return jsonText({ error: 'No self-project configured' })
        const exists = await prisma.task.findFirst({
          where: { id: ticketId, projectId: self.id },
          select: { id: true },
        })
        if (!exists) return jsonText({ error: 'Ticket not found in self-project' })
        const author = await prisma.user.findUnique({
          where: { email: authorEmail },
          select: { id: true, role: true },
        })
        if (!author) return jsonText({ error: `Author not found: ${authorEmail}` })
        const comment = await prisma.taskComment.create({
          data: { taskId: ticketId, authorId: author.id, authorTag: author.role, body: body.trim() },
        })
        return jsonText({ ok: true, comment })
      },
    )

    server.registerTool(
      'qc_ticket_delete',
      {
        title: 'Delete QC ticket',
        description:
          'Permanently delete a QC ticket (must belong to the self-project). Cascades to comments, evidence, checklist, statusChanges, and tag links. Irreversible.',
        inputSchema: { ticketId: z.string() },
      },
      async ({ ticketId }) => {
        const self = await getSelfProject()
        if (!self) return jsonText({ error: 'No self-project configured' })
        const exists = await prisma.task.findFirst({
          where: { id: ticketId, projectId: self.id },
          select: { id: true, title: true },
        })
        if (!exists) return jsonText({ error: 'Ticket not found in self-project' })
        await prisma.task.delete({ where: { id: ticketId } })
        await audit(null, 'MCP_QC_TICKET_DELETED', `#${exists.id} ${exists.title}`)
        appLog('info', `MCP: QC ticket deleted #${exists.id}`)
        return jsonText({ ok: true, deleted: { id: exists.id, title: exists.title } })
      },
    )

    server.registerTool(
      'qc_ticket_evidence_add',
      {
        title: 'Add evidence to QC ticket',
        description: 'Attach an evidence URL (screenshot/log/PR link) to a QC ticket.',
        inputSchema: {
          ticketId: z.string(),
          url: z.string().url(),
          note: z.string().optional(),
        },
      },
      async ({ ticketId, url, note }) => {
        const self = await getSelfProject()
        if (!self) return jsonText({ error: 'No self-project configured' })
        const exists = await prisma.task.findFirst({
          where: { id: ticketId, projectId: self.id },
          select: { id: true },
        })
        if (!exists) return jsonText({ error: 'Ticket not found in self-project' })
        const evidence = await prisma.taskEvidence.create({
          data: { taskId: ticketId, url, kind: 'LINK', note: note ?? null },
        })
        return jsonText({ ok: true, evidence })
      },
    )
  },
}
