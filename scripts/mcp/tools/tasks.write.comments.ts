import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText } from './shared'
import { resolveUserEmail } from './tasks.helpers'

// Task comment write tools: add / edit / delete.
export function registerTaskCommentTools(server: McpServer) {
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
}
