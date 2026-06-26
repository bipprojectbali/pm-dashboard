import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { getSelfProject } from '../../../src/lib/self-project'
import { jsonText } from './shared'
import { audit } from './qc.helpers'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerQcTicketActionTools(server: McpServer) {
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
}
