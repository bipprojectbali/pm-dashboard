import { z } from 'zod'
import { clearAppLogs, getAppLogs, redactLogText } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { jsonText, type ToolModule } from './shared'

export const logsReadonly: ToolModule = {
  name: 'logs-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'logs_app',
      {
        title: 'App logs',
        description: 'Tail the Redis-backed app log buffer (last 500 entries)',
        inputSchema: {
          level: z.enum(['info', 'warn', 'error']).optional(),
          limit: z.number().int().min(1).max(500).default(100),
          afterId: z.number().int().optional(),
          search: z.string().optional().describe('Substring match on message'),
        },
      },
      async ({ level, limit, afterId, search }) => {
        let logs = await getAppLogs({ level, limit, afterId })
        if (search) {
          const s = search.toLowerCase()
          logs = logs.filter((l) => l.message.toLowerCase().includes(s))
        }
        return jsonText({ count: logs.length, logs })
      },
    )

    server.registerTool(
      'logs_redact_preview',
      {
        title: 'App log redaction preview',
        description:
          'Run the appLog sink redaction over a string and show what would be stored. Email-shaped substrings are masked; opaque credentials are not (they have no matchable shape and must never be passed to appLog).',
        inputSchema: {
          text: z.string().describe('Candidate log message or detail'),
        },
      },
      async ({ text }) => {
        const redacted = redactLogText(text)
        return jsonText({ input: text, redacted, changed: redacted !== text })
      },
    )

    server.registerTool(
      'logs_audit',
      {
        title: 'Audit logs',
        description: 'Persistent audit trail from the database',
        inputSchema: {
          userId: z.string().optional(),
          action: z.string().optional(),
          sinceISO: z.string().optional(),
          limit: z.number().int().min(1).max(1000).default(100),
        },
      },
      async ({ userId, action, sinceISO, limit }) => {
        const where: Record<string, unknown> = {}
        if (userId) where.userId = userId
        if (action) where.action = action
        if (sinceISO) where.createdAt = { gte: new Date(sinceISO) }
        const logs = await prisma.auditLog.findMany({
          where,
          take: limit,
          orderBy: { createdAt: 'desc' },
        })
        return jsonText({ count: logs.length, logs })
      },
    )
  },
}

export const logsAdmin: ToolModule = {
  name: 'logs-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'logs_clear_app',
      {
        title: 'Clear app logs',
        description: 'Wipe the Redis app log buffer',
        inputSchema: {},
      },
      async () => {
        await clearAppLogs()
        return jsonText({ ok: true })
      },
    )

    server.registerTool(
      'logs_clear_audit',
      {
        title: 'Clear audit logs',
        description: 'Delete all audit log rows from the database',
        inputSchema: {
          confirm: z.literal(true).describe('Must be true to execute'),
        },
      },
      async ({ confirm }) => {
        if (!confirm) return jsonText({ error: 'confirm must be true' })
        const result = await prisma.auditLog.deleteMany({})
        return jsonText({ ok: true, deleted: result.count })
      },
    )
  },
}
