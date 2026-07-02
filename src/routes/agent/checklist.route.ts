import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth, resolveReporterId } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getIp, writeAuditLog } from '../../lib/route-helpers'
import { deny, ownedTask, resolveChecklistWrite } from './shared'

// Task comments + checklist items for the token-only agent REST surface.
export function agentChecklistRoutes() {
  return new Elysia()
    .post('/api/agent/tasks/:id/comments', async ({ request, params, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
      const task = await ownedTask(params.id, auth.projectId)
      if (!task) return deny(set, 404, 'Task not found')
      const { body: text } = (await request.json()) as { body?: string }
      if (!text?.trim()) return deny(set, 400, 'body wajib diisi')
      const authorId = await resolveReporterId(auth.projectId, auth.userId)
      const comment = await prisma.taskComment.create({
        data: { taskId: params.id, authorId, authorTag: 'AGENT', body: text.trim() },
      })
      writeAuditLog(auth.userId, 'AGENT_TASK_COMMENTED', `#${params.id}`, getIp(request))
      emitInvalidate('tasks', { projectId: auth.projectId })
      return { comment }
    })

    .post('/api/agent/tasks/:id/checklist', async ({ request, params, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
      const task = await ownedTask(params.id, auth.projectId)
      if (!task) return deny(set, 404, 'Task not found')
      const body = (await request.json()) as { title?: string }
      if (!body.title?.trim()) return deny(set, 400, 'title wajib diisi')
      const last = await prisma.taskChecklistItem.findFirst({
        where: { taskId: params.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const item = await prisma.taskChecklistItem.create({
        data: { taskId: params.id, title: body.title.trim(), order: (last?.order ?? -1) + 1 },
      })
      emitInvalidate('tasks', { projectId: auth.projectId })
      return { item }
    })

    .patch('/api/agent/checklist/:id', async ({ request, params, set }) => {
      const gate = await resolveChecklistWrite(request, params.id)
      if ('error' in gate) return deny(set, gate.status, gate.error)
      const body = (await request.json()) as { title?: string; done?: boolean }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title
      if (body.done !== undefined) data.done = body.done
      const item = await prisma.taskChecklistItem.update({ where: { id: params.id }, data })
      emitInvalidate('tasks', { projectId: gate.projectId })
      return { item }
    })

    .delete('/api/agent/checklist/:id', async ({ request, params, set }) => {
      const gate = await resolveChecklistWrite(request, params.id)
      if ('error' in gate) return deny(set, gate.status, gate.error)
      await prisma.taskChecklistItem.delete({ where: { id: params.id } })
      emitInvalidate('tasks', { projectId: gate.projectId })
      return { ok: true }
    })
}
