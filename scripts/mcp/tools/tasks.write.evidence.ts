import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText } from './shared'
import { audit } from './tasks.helpers'

// Task evidence write tools: attach / delete.
export function registerTaskEvidenceTools(server: McpServer) {
  server.registerTool(
    'task_add_evidence',
    {
      title: 'Attach evidence',
      description: 'Attach a URL (screenshot, commit, log) to a task.',
      inputSchema: {
        taskId: z.string(),
        kind: z.string().describe('e.g. screenshot, commit, log, pr'),
        url: z.string().url(),
        note: z.string().optional(),
      },
    },
    async ({ taskId, kind, url, note }) => {
      const evidence = await prisma.taskEvidence.create({
        data: { taskId, kind, url, note: note ?? null },
      })
      return jsonText({ ok: true, evidence })
    },
  )

  server.registerTool(
    'task_delete_evidence',
    {
      title: 'Delete evidence',
      description: 'Remove an evidence attachment from a task by evidence id. Locally-uploaded files are unlinked too.',
      inputSchema: { evidenceId: z.string() },
    },
    async ({ evidenceId }) => {
      const evidence = await prisma.taskEvidence.findUnique({
        where: { id: evidenceId },
        select: { id: true, taskId: true, url: true },
      })
      if (!evidence) return jsonText({ error: `Evidence not found: ${evidenceId}` })
      const match = evidence.url.match(/^\/api\/evidence\/([^?]+)/)
      if (match) {
        const { removeEvidence } = await import('../../../src/lib/evidence-storage')
        const fs = await import('node:fs/promises')
        const path = await import('node:path')
        const { env } = await import('../../../src/lib/env')
        const safeName = match[1].replace(/[^a-zA-Z0-9._-]/g, '')
        await removeEvidence(evidence.taskId, safeName)
        const rootDir = path.resolve(env.UPLOADS_DIR, 'evidence', evidence.taskId)
        const fullPath = path.resolve(rootDir, safeName)
        if (fullPath.startsWith(rootDir)) await fs.unlink(fullPath).catch(() => {})
      }
      await prisma.taskEvidence.delete({ where: { id: evidence.id } })
      await audit(null, 'MCP_EVIDENCE_DELETED', `task=${evidence.taskId} evidence=${evidence.id}`)
      return jsonText({ ok: true })
    },
  )
}
