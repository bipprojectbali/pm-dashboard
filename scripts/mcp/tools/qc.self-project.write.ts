import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { clearSelfProject, setSelfProject } from '../../../src/lib/self-project'
import { jsonText } from './shared'
import { audit } from './qc.helpers'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerQcSelfProjectWriteTools(server: McpServer) {
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
}
