import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { resolveTicketContent } from '../../../src/lib/qc-ticket-template'
import { AI_QUEUE_TAG, clearSelfProject, ensureAiQueueTag, getSelfProject, setSelfProject } from '../../../src/lib/self-project'
import { jsonText, type ToolModule } from './shared'
import { audit } from './qc.helpers'

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
          'Create a QC ticket (kind=BUG) in the self-project. Auto-applies the "ai-queue" tag so Claude can pick it up. reporterEmail must exist as a User. Two ways to supply the body: (1) structured — pass stepsToReproduce + expected + actual (all three required together; environment/browser/appVersion optional) and the description markdown is composed from them; (2) free-text — pass a plain description. Prefer structured so the picked ticket carries full reproduction context.',
        inputSchema: {
          title: z.string().min(1),
          description: z.string().optional().describe('Free-text body. Required unless structured fields (steps/expected/actual) are supplied.'),
          reporterEmail: z.string().email(),
          priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
          route: z.string().optional().describe('Frontend route where the bug was observed, e.g. "/admin".'),
          evidenceUrls: z.array(z.string().url()).optional(),
          stepsToReproduce: z.string().optional().describe('Numbered/bulleted steps to trigger the bug. Required when filing structured.'),
          expected: z.string().optional().describe('What should happen. Required when filing structured.'),
          actual: z.string().optional().describe('What actually happens. Required when filing structured.'),
          environment: z.string().optional().describe('Deployment env, e.g. "production" / "staging".'),
          browser: z.string().optional().describe('Browser + version, e.g. "Chrome 120".'),
          appVersion: z.string().optional().describe('pm-dashboard version, e.g. "0.7.18".'),
        },
      },
      async ({ title, reporterEmail, priority, route, evidenceUrls, ...rest }) => {
        const self = await getSelfProject()
        if (!self) return jsonText({ error: 'No self-project configured' })
        const reporter = await prisma.user.findUnique({
          where: { email: reporterEmail },
          select: { id: true, name: true },
        })
        if (!reporter) return jsonText({ error: `Reporter not found: ${reporterEmail}` })
        const content = resolveTicketContent(rest)
        if (!content.ok) return jsonText({ error: content.error })
        const tag = await ensureAiQueueTag(self.id)
        const ticket = await prisma.task.create({
          data: {
            projectId: self.id,
            kind: 'BUG',
            title: title.trim(),
            description: content.description,
            priority,
            route: route ?? null,
            reporterId: reporter.id,
            ...content.columns,
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
