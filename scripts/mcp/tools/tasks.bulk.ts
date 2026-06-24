import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { jsonText } from './shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type TaskStatus, audit, resolveUserEmail, shortestPath } from './tasks.helpers'

export function registerBulkTools(server: McpServer) {
  server.registerTool(
    'task_bulk_create',
    {
      title: 'Bulk-create tasks on a project',
      description:
        'Create multiple tasks on one project in a single call. Ideal for seeding varied data. Returns per-row result.',
      inputSchema: {
        projectId: z.string(),
        reporterEmail: z.string().email().describe('Default reporter for all rows (per-row override coming later)'),
        tasks: z
          .array(
            z.object({
              title: z.string().min(1).max(500),
              description: z.string().min(1),
              kind: z.enum(['TASK', 'BUG', 'QC']).default('TASK'),
              priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
              assigneeEmail: z.string().email().optional(),
              startsAt: z.string().optional(),
              dueAt: z.string().optional(),
              estimateHours: z.number().min(0).optional(),
              tagIds: z.array(z.string()).optional(),
              finalStatus: z
                .enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'])
                .optional()
                .describe('If set, walks task to this status after create'),
            }),
          )
          .min(1)
          .max(100),
      },
    },
    async ({ projectId, reporterEmail, tasks }) => {
      const reporter = await resolveUserEmail(reporterEmail)
      if (!reporter) return jsonText({ error: `Reporter not found: ${reporterEmail}` })

      const emails = new Set<string>()
      const allTagIds = new Set<string>()
      for (const t of tasks) {
        if (t.assigneeEmail) emails.add(t.assigneeEmail)
        if (t.tagIds) for (const id of t.tagIds) allTagIds.add(id)
      }
      const users = emails.size
        ? await prisma.user.findMany({ where: { email: { in: [...emails] } }, select: { id: true, email: true } })
        : []
      const userByEmail = new Map(users.map((u) => [u.email, u.id]))
      if (allTagIds.size) {
        const found = await prisma.tag.findMany({
          where: { id: { in: [...allTagIds] }, projectId },
          select: { id: true },
        })
        if (found.length !== allTagIds.size) {
          return jsonText({ error: 'One or more tagIds do not belong to this project' })
        }
      }

      const results: Array<{ index: number; ok: boolean; id?: string; error?: string; hops?: TaskStatus[] }> = []
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i]
        try {
          let assigneeId: string | null = null
          if (t.assigneeEmail) {
            const id = userByEmail.get(t.assigneeEmail)
            if (!id) throw new Error(`Assignee not found: ${t.assigneeEmail}`)
            assigneeId = id
          }
          const task = await prisma.task.create({
            data: {
              projectId,
              kind: t.kind,
              title: t.title,
              description: t.description,
              priority: t.priority,
              reporterId: reporter.id,
              assigneeId,
              startsAt: t.startsAt ? new Date(t.startsAt) : null,
              dueAt: t.dueAt ? new Date(t.dueAt) : null,
              estimateHours: typeof t.estimateHours === 'number' ? t.estimateHours : null,
              tags: t.tagIds?.length ? { create: t.tagIds.map((tagId) => ({ tagId })) } : undefined,
            },
          })
          let hops: TaskStatus[] = []
          if (t.finalStatus && t.finalStatus !== 'OPEN') {
            const path = shortestPath(t.kind, 'OPEN', t.finalStatus)
            if (path === null) throw new Error(`No valid path OPEN → ${t.finalStatus} for ${t.kind}`)
            let last: TaskStatus = 'OPEN'
            for (const next of path) {
              const data: Record<string, unknown> = { status: next }
              if (next === 'CLOSED') data.closedAt = new Date()
              if (next === 'REOPENED') data.closedAt = null
              await prisma.task.update({ where: { id: task.id }, data })
              await prisma.taskStatusChange.create({
                data: { taskId: task.id, authorId: reporter.id, fromStatus: last, toStatus: next },
              })
              last = next
            }
            hops = path
          }
          results.push({ index: i, ok: true, id: task.id, hops })
        } catch (e) {
          results.push({ index: i, ok: false, error: (e as Error).message })
        }
      }
      const okCount = results.filter((r) => r.ok).length
      await audit(reporter.id, 'MCP_TASK_BULK_CREATED', `project=${projectId} ok=${okCount}/${tasks.length}`)
      appLog('info', `MCP: task_bulk_create ${okCount}/${tasks.length} on project ${projectId}`)
      return jsonText({ ok: true, total: tasks.length, succeeded: okCount, results })
    },
  )
}
