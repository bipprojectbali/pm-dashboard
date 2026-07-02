import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getIp, writeAuditLog } from '../../lib/route-helpers'
import { deny, ownedTask, parseJson, resolveChecklistWrite } from './shared'

// Checklist routes for the token-scoped agent surface: add / update / delete.
export function agentChecklistRoutes() {
  return new Elysia()
    .post('/api/agent/tasks/:id/checklist', async ({ request, params, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
      const task = await ownedTask(params.id, auth.projectId)
      if (!task) return deny(set, 404, 'Task not found')
      const parsed = await parseJson<{ title?: string }>(request)
      if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')
      if (!parsed.body.title?.trim()) return deny(set, 400, 'title is required')
      const last = await prisma.taskChecklistItem.findFirst({
        where: { taskId: params.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const item = await prisma.taskChecklistItem.create({
        data: { taskId: params.id, title: parsed.body.title.trim(), order: (last?.order ?? -1) + 1 },
      })
      writeAuditLog(auth.userId, 'AGENT_CHECKLIST_ADDED', `#${params.id} ${item.title}`, getIp(request))
      emitInvalidate('tasks', { projectId: auth.projectId })
      return { item }
    })

    .patch('/api/agent/checklist/:id', async ({ request, params, set }) => {
      const gate = await resolveChecklistWrite(request, params.id)
      if ('error' in gate) return deny(set, gate.status, gate.error)
      const parsed = await parseJson<{ title?: string; done?: boolean }>(request)
      if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')
      const data: Record<string, unknown> = {}
      if (parsed.body.title !== undefined) {
        if (typeof parsed.body.title !== 'string' || !parsed.body.title.trim())
          return deny(set, 400, 'title must be a non-empty string')
        data.title = parsed.body.title.trim()
      }
      if (parsed.body.done !== undefined) {
        if (typeof parsed.body.done !== 'boolean') return deny(set, 400, 'done must be a boolean')
        data.done = parsed.body.done
      }
      if (Object.keys(data).length === 0) return deny(set, 400, 'Nothing to update (title or done required)')
      const item = await prisma.taskChecklistItem.update({ where: { id: params.id }, data })
      writeAuditLog(gate.userId, 'AGENT_CHECKLIST_UPDATED', `#${params.id}`, getIp(request))
      emitInvalidate('tasks', { projectId: gate.projectId })
      return { item }
    })

    .delete('/api/agent/checklist/:id', async ({ request, params, set }) => {
      const gate = await resolveChecklistWrite(request, params.id)
      if ('error' in gate) return deny(set, gate.status, gate.error)
      await prisma.taskChecklistItem.delete({ where: { id: params.id } })
      writeAuditLog(gate.userId, 'AGENT_CHECKLIST_DELETED', `#${params.id}`, getIp(request))
      emitInvalidate('tasks', { projectId: gate.projectId })
      return { ok: true }
    })
}
