import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText } from './shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerChecklistTools(server: McpServer) {
  server.registerTool(
    'task_checklist_add',
    {
      title: 'Add checklist items',
      description:
        'Append checklist items to a task. `order` auto-increments from current max. Returns the created items.',
      inputSchema: {
        taskId: z.string(),
        items: z
          .array(
            z.object({
              title: z.string().min(1),
              done: z.boolean().default(false),
            }),
          )
          .min(1),
      },
    },
    async ({ taskId, items }) => {
      const existing = await prisma.taskChecklistItem.findFirst({
        where: { taskId },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const baseOrder = (existing?.order ?? -1) + 1
      const created = await prisma.$transaction(
        items.map((it, i) =>
          prisma.taskChecklistItem.create({
            data: { taskId, title: it.title, done: it.done, order: baseOrder + i },
          }),
        ),
      )
      return jsonText({ ok: true, created })
    },
  )

  server.registerTool(
    'task_checklist_update',
    {
      title: 'Update checklist item',
      description: 'Toggle done or rename a checklist item.',
      inputSchema: {
        itemId: z.string(),
        title: z.string().optional(),
        done: z.boolean().optional(),
        order: z.number().int().optional(),
      },
    },
    async ({ itemId, ...rest }) => {
      const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
      if (!Object.keys(data).length) return jsonText({ error: 'Nothing to update' })
      const item = await prisma.taskChecklistItem.update({ where: { id: itemId }, data })
      return jsonText({ ok: true, item })
    },
  )

  server.registerTool(
    'task_checklist_delete',
    {
      title: 'Delete checklist item',
      inputSchema: { itemId: z.string() },
    },
    async ({ itemId }) => {
      const item = await prisma.taskChecklistItem.delete({ where: { id: itemId } })
      return jsonText({ ok: true, item })
    },
  )
}

export function registerDependencyTools(server: McpServer) {
  server.registerTool(
    'task_dependency_add',
    {
      title: 'Add task dependency',
      description: 'Mark `taskId` as blocked by `blockedByTaskId`. Rejects self-dependencies and duplicates.',
      inputSchema: {
        taskId: z.string(),
        blockedByTaskId: z.string(),
      },
    },
    async ({ taskId, blockedByTaskId }) => {
      if (taskId === blockedByTaskId) return jsonText({ error: 'A task cannot block itself' })
      const [a, b] = await Promise.all([
        prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true } }),
        prisma.task.findUnique({ where: { id: blockedByTaskId }, select: { id: true, projectId: true } }),
      ])
      if (!a) return jsonText({ error: `Task not found: ${taskId}` })
      if (!b) return jsonText({ error: `Task not found: ${blockedByTaskId}` })
      if (a.projectId !== b.projectId) {
        return jsonText({ error: 'Cross-project dependencies are not allowed' })
      }
      try {
        const dep = await prisma.taskDependency.create({ data: { taskId, blockedById: blockedByTaskId } })
        return jsonText({ ok: true, dep })
      } catch (e) {
        return jsonText({ error: `Dependency already exists or insert failed: ${(e as Error).message}` })
      }
    },
  )

  server.registerTool(
    'task_dependency_remove',
    {
      title: 'Remove task dependency',
      inputSchema: {
        taskId: z.string(),
        blockedByTaskId: z.string(),
      },
    },
    async ({ taskId, blockedByTaskId }) => {
      const res = await prisma.taskDependency.deleteMany({
        where: { taskId, blockedById: blockedByTaskId },
      })
      return jsonText({ ok: true, removed: res.count })
    },
  )
}
