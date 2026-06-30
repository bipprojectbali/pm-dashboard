import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { jsonText } from './shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  type TaskKind,
  type TaskStatus,
  audit,
  resolveUserEmail,
  TRANSITIONS,
  shortestPath,
  validateTagsForProject,
} from './tasks.helpers'

export function registerTaskWriteTools(server: McpServer) {
  server.registerTool(
    'task_create',
    {
      title: 'Create task',
      description: 'Create a new task/bug/QC item in a project. Supports estimate, dates, and tags.',
      inputSchema: {
        projectId: z.string(),
        title: z.string().min(1).max(500),
        description: z.string().min(1),
        kind: z.enum(['TASK', 'BUG', 'QC', 'TICKET', 'IDEA']).default('TASK'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
        reporterEmail: z.string().email(),
        assigneeEmail: z.string().email().optional(),
        route: z.string().optional(),
        startsAt: z.string().optional().describe('ISO date'),
        dueAt: z.string().optional().describe('ISO date'),
        estimateHours: z.number().min(0).optional(),
        tagIds: z.array(z.string()).optional().describe('Tag IDs (must belong to the same project)'),
      },
    },
    async ({ projectId, title, description, kind, priority, reporterEmail, assigneeEmail, route, startsAt, dueAt, estimateHours, tagIds }) => {
      const reporter = await resolveUserEmail(reporterEmail)
      if (!reporter) return jsonText({ error: `Reporter not found: ${reporterEmail}` })
      let assigneeId: string | null = null
      if (assigneeEmail) {
        const a = await resolveUserEmail(assigneeEmail)
        if (!a) return jsonText({ error: `Assignee not found: ${assigneeEmail}` })
        assigneeId = a.id
      }
      if (tagIds?.length) {
        const ok = await validateTagsForProject(projectId, tagIds)
        if (!ok.ok) return jsonText({ error: ok.error })
      }
      const task = await prisma.task.create({
        data: {
          projectId,
          title,
          description,
          kind,
          priority,
          reporterId: reporter.id,
          assigneeId,
          route: route ?? null,
          startsAt: startsAt ? new Date(startsAt) : null,
          dueAt: dueAt ? new Date(dueAt) : null,
          estimateHours: typeof estimateHours === 'number' ? estimateHours : null,
          tags: tagIds?.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
        },
      })
      await audit(reporter.id, 'MCP_TASK_CREATED', `#${task.id} ${task.title}`)
      appLog('info', `MCP: task created ${task.title} by ${reporter.email}`)
      return jsonText({ ok: true, task })
    },
  )

  server.registerTool(
    'task_update',
    {
      title: 'Update task',
      description:
        'Update task fields. Set status=CLOSED to stamp closedAt; status=REOPENED clears it. Status changes are validated against the task state machine — use task_transition to walk multiple hops.',
      inputSchema: {
        taskId: z.string(),
        title: z.string().max(500).optional(),
        description: z.string().optional(),
        status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED']).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        kind: z.enum(['TASK', 'BUG', 'QC', 'TICKET', 'IDEA']).optional(),
        assigneeEmail: z.string().email().nullable().optional(),
        route: z.string().nullable().optional(),
        startsAt: z.string().nullable().optional(),
        dueAt: z.string().nullable().optional(),
        estimateHours: z.number().nullable().optional(),
        progressPercent: z.number().min(0).max(100).nullable().optional(),
        tagIds: z.array(z.string()).optional().describe('Replaces the full tag set on the task'),
        actorEmail: z.string().email().optional().describe('Records this user as the author of any status change'),
      },
    },
    async ({ taskId, assigneeEmail, startsAt, dueAt, status, tagIds, actorEmail, ...rest }) => {
      const current = await prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, projectId: true, status: true, kind: true },
      })
      if (!current) return jsonText({ error: 'Task not found' })
      const data: Record<string, unknown> = { ...rest }
      let statusChange: { from: TaskStatus; to: TaskStatus } | null = null
      if (status !== undefined && status !== current.status) {
        const allowed = TRANSITIONS[current.kind as TaskKind][current.status as TaskStatus]
        if (!allowed.includes(status as TaskStatus)) {
          return jsonText({
            error: `Invalid transition: ${current.status} → ${status} for ${current.kind}. Allowed: ${allowed.join(', ') || '(none)'}. Use task_transition for multi-hop walks.`,
          })
        }
        data.status = status
        if (status === 'CLOSED') data.closedAt = new Date()
        if (status === 'REOPENED') data.closedAt = null
        statusChange = { from: current.status as TaskStatus, to: status as TaskStatus }
      }
      if (assigneeEmail !== undefined) {
        if (assigneeEmail === null) {
          data.assigneeId = null
        } else {
          const a = await resolveUserEmail(assigneeEmail)
          if (!a) return jsonText({ error: `Assignee not found: ${assigneeEmail}` })
          data.assigneeId = a.id
        }
      }
      if (startsAt !== undefined) data.startsAt = startsAt ? new Date(startsAt) : null
      if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null
      if (tagIds !== undefined) {
        const ok = await validateTagsForProject(current.projectId, tagIds)
        if (!ok.ok) return jsonText({ error: ok.error })
      }
      const actor = actorEmail ? await resolveUserEmail(actorEmail) : null
      const task = await prisma.task.update({ where: { id: taskId }, data })
      if (statusChange) {
        await prisma.taskStatusChange.create({
          data: {
            taskId: task.id,
            authorId: actor?.id ?? null,
            fromStatus: statusChange.from,
            toStatus: statusChange.to,
          },
        })
      }
      if (tagIds !== undefined) {
        await prisma.taskTag.deleteMany({ where: { taskId: task.id } })
        if (tagIds.length) {
          await prisma.taskTag.createMany({
            data: tagIds.map((tagId) => ({ taskId: task.id, tagId })),
            skipDuplicates: true,
          })
        }
      }
      await audit(actor?.id ?? null, 'MCP_TASK_UPDATED', `#${task.id} ${Object.keys(data).join(',')}`)
      return jsonText({ ok: true, task, statusChange })
    },
  )

  server.registerTool(
    'task_delete',
    {
      title: 'Delete task',
      description: 'Permanently delete a task (cascades to comments and evidence).',
      inputSchema: { taskId: z.string() },
    },
    async ({ taskId }) => {
      const task = await prisma.task.delete({ where: { id: taskId } })
      await audit(null, 'MCP_TASK_DELETED', `#${task.id} ${task.title}`)
      return jsonText({ ok: true, task })
    },
  )

  server.registerTool(
    'task_transition',
    {
      title: 'Walk task to target status',
      description:
        'Apply the shortest valid sequence of status transitions to reach targetStatus. Writes a TaskStatusChange row for each hop. Safe to call when already at target (no-op).',
      inputSchema: {
        taskId: z.string(),
        targetStatus: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED']),
        actorEmail: z.string().email().optional(),
      },
    },
    async ({ taskId, targetStatus, actorEmail }) => {
      const current = await prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, status: true, kind: true },
      })
      if (!current) return jsonText({ error: 'Task not found' })
      const path = shortestPath(current.kind as TaskKind, current.status as TaskStatus, targetStatus)
      if (path === null) {
        return jsonText({ error: `No valid path from ${current.status} to ${targetStatus} for ${current.kind}` })
      }
      if (path.length === 0) {
        return jsonText({ ok: true, task: current, hops: [], message: 'Already at target status' })
      }
      const actor = actorEmail ? await resolveUserEmail(actorEmail) : null
      let last = current.status as TaskStatus
      let task = null as Awaited<ReturnType<typeof prisma.task.update>> | null
      for (const next of path) {
        const data: Record<string, unknown> = { status: next }
        if (next === 'CLOSED') data.closedAt = new Date()
        if (next === 'REOPENED') data.closedAt = null
        task = await prisma.task.update({ where: { id: taskId }, data })
        await prisma.taskStatusChange.create({
          data: { taskId, authorId: actor?.id ?? null, fromStatus: last, toStatus: next },
        })
        last = next
      }
      await audit(actor?.id ?? null, 'MCP_TASK_TRANSITIONED', `#${taskId} ${current.status} → ${path.join(' → ')}`)
      return jsonText({ ok: true, task, hops: path })
    },
  )

  server.registerTool(
    'task_comment',
    {
      title: 'Comment on task',
      description: 'Add a comment to a task.',
      inputSchema: {
        taskId: z.string(),
        body: z.string().min(1),
        authorEmail: z.string().email(),
      },
    },
    async ({ taskId, body, authorEmail }) => {
      const author = await resolveUserEmail(authorEmail)
      if (!author) return jsonText({ error: `Author not found: ${authorEmail}` })
      const comment = await prisma.taskComment.create({
        data: { taskId, authorId: author.id, authorTag: author.role, body },
      })
      return jsonText({ ok: true, comment })
    },
  )

  server.registerTool(
    'task_comment_update',
    {
      title: 'Edit task comment',
      description: 'Edit a task comment body and stamp editedAt. MCP admin scope — no author check. 404 if the comment is not on the given task.',
      inputSchema: {
        taskId: z.string(),
        commentId: z.string(),
        body: z.string().min(1),
      },
    },
    async ({ taskId, commentId, body }) => {
      const comment = await prisma.taskComment.findFirst({
        where: { id: commentId, task: { id: taskId, deletedAt: null } },
        select: { id: true },
      })
      if (!comment) return jsonText({ error: 'Comment not found' })
      const updated = await prisma.taskComment.update({
        where: { id: comment.id },
        data: { body: body.trim(), editedAt: new Date() },
      })
      return jsonText({ ok: true, comment: updated })
    },
  )

  server.registerTool(
    'task_comment_delete',
    {
      title: 'Delete task comment',
      description: 'Permanently delete a task comment. MCP admin scope — no author check. 404 if the comment is not on the given task.',
      inputSchema: {
        taskId: z.string(),
        commentId: z.string(),
      },
    },
    async ({ taskId, commentId }) => {
      const comment = await prisma.taskComment.findFirst({
        where: { id: commentId, task: { id: taskId, deletedAt: null } },
        select: { id: true },
      })
      if (!comment) return jsonText({ error: 'Comment not found' })
      await prisma.taskComment.delete({ where: { id: comment.id } })
      return jsonText({ ok: true, deleted: { id: comment.id } })
    },
  )

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
}
