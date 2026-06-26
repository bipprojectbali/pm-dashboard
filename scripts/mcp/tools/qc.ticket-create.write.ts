import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { resolveTicketContent } from '../../../src/lib/qc-ticket-template'
import { ensureAiQueueTag, getSelfProject } from '../../../src/lib/self-project'
import { jsonText } from './shared'
import { audit } from './qc.helpers'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerQcTicketCreateTool(server: McpServer) {
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
}
