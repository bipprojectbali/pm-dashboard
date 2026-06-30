import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText, type ToolModule } from './shared'
import { resolveUserEmail } from './tasks.helpers'
import { registerTaskWriteTools } from './tasks.write'
import { registerChecklistTools, registerDependencyTools } from './tasks.checklist'
import { registerBulkTools } from './tasks.bulk'

export const tasksReadonly: ToolModule = {
  name: 'tasks-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'task_list',
      {
        title: 'List tasks',
        description: 'List tasks across projects with optional filters.',
        inputSchema: {
          projectId: z.string().optional(),
          status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED', 'ALL']).default('ALL'),
          kind: z.enum(['TASK', 'BUG', 'QC', 'TICKET', 'IDEA', 'ALL']).default('ALL'),
          assigneeEmail: z.string().email().optional(),
          limit: z.number().int().min(1).max(500).default(100),
        },
      },
      async ({ projectId, status, kind, assigneeEmail, limit }) => {
        const where: Record<string, unknown> = {}
        if (projectId) where.projectId = projectId
        if (status !== 'ALL') where.status = status
        if (kind !== 'ALL') where.kind = kind
        if (assigneeEmail) {
          const u = await resolveUserEmail(assigneeEmail)
          if (!u) return jsonText({ error: `User not found: ${assigneeEmail}` })
          where.assigneeId = u.id
        }
        const tasks = await prisma.task.findMany({
          where,
          include: {
            project: { select: { id: true, name: true } },
            reporter: { select: { id: true, name: true, email: true } },
            assignee: { select: { id: true, name: true, email: true } },
            _count: { select: { comments: true, evidence: true } },
          },
          orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
          take: limit,
        })
        return jsonText({ count: tasks.length, tasks })
      },
    )

    server.registerTool(
      'task_get',
      {
        title: 'Get task detail',
        description: 'Fetch full task including comments and evidence.',
        inputSchema: { taskId: z.string() },
      },
      async ({ taskId }) => {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            project: { select: { id: true, name: true } },
            reporter: { select: { id: true, name: true, email: true } },
            assignee: { select: { id: true, name: true, email: true } },
            comments: {
              include: { author: { select: { id: true, name: true, email: true } } },
              orderBy: { createdAt: 'asc' },
            },
            evidence: { orderBy: { createdAt: 'asc' } },
          },
        })
        if (!task) return jsonText({ error: 'Task not found' })
        return jsonText({ task })
      },
    )
  },
}

export const tasksTools: ToolModule = {
  name: 'tasks',
  scope: 'admin',
  register(server) {
    registerTaskWriteTools(server)
    registerChecklistTools(server)
    registerDependencyTools(server)
    registerBulkTools(server)
  },
}
