import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth, resolveReporterId } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getIp, writeAuditLog } from '../../lib/route-helpers'
import { deny, ownedTask, parseJson } from './shared'

// Comment route for the token-scoped agent surface. Comments are read back via
// the task detail route (GET /api/agent/tasks/:id).
export function agentCommentRoutes() {
  return new Elysia().post('/api/agent/tasks/:id/comments', async ({ request, params, set }) => {
    const auth = await resolveAgentAuth(request)
    if (!auth.ok) return deny(set, auth.status, auth.error)
    if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
    const task = await ownedTask(params.id, auth.projectId)
    if (!task) return deny(set, 404, 'Task not found')
    const parsed = await parseJson<{ body?: string }>(request)
    if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')
    const text = parsed.body.body
    if (!text?.trim()) return deny(set, 400, 'body is required')
    const authorId = await resolveReporterId(auth.projectId, auth.userId)
    const comment = await prisma.taskComment.create({
      data: { taskId: params.id, authorId, authorTag: 'AGENT', body: text.trim() },
    })
    writeAuditLog(auth.userId, 'AGENT_TASK_COMMENTED', `#${params.id}`, getIp(request))
    emitInvalidate('tasks', { projectId: auth.projectId })
    return { comment }
  })
}
