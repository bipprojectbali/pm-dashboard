import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth, resolveReporterId } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getIp, writeAuditLog } from '../../lib/route-helpers'
import { type TaskStatus } from '../../lib/task-enums'
import { deny, ownedTask } from './shared'

const CLAIMABLE: TaskStatus[] = ['OPEN', 'REOPENED']

// POST /api/agent/tasks/:id/claim — atomically transition a task to IN_PROGRESS
// only if it is currently OPEN or REOPENED. Uses updateMany with a status guard
// so the check and the write are a single DB round-trip (avoids TOCTOU races).
export function agentClaimRoutes() {
  return new Elysia().post('/api/agent/tasks/:id/claim', async ({ request, params, set }) => {
    const auth = await resolveAgentAuth(request)
    if (!auth.ok) return deny(set, auth.status, auth.error)
    if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
    const task = await ownedTask(params.id, auth.projectId)
    if (!task) return deny(set, 404, 'Task not found')
    if (task.kind === 'IDEA') return deny(set, 403, 'IDEA is read-only via access token')
    const updated = await prisma.task.updateMany({
      where: { id: params.id, status: { in: CLAIMABLE } },
      data: { status: 'IN_PROGRESS' },
    })
    if (updated.count === 0) {
      set.status = 409
      return { error: `Task is not claimable (current status: ${task.status})` }
    }
    const authorId = await resolveReporterId(auth.projectId, auth.userId)
    await prisma.taskStatusChange.create({
      data: {
        taskId: params.id,
        authorId,
        fromStatus: task.status as 'OPEN' | 'REOPENED',
        toStatus: 'IN_PROGRESS',
      },
    })
    writeAuditLog(auth.userId, 'AGENT_TASK_CLAIMED', `#${params.id}`, getIp(request))
    emitInvalidate('tasks', { projectId: auth.projectId })
    return { ok: true, taskId: params.id, from: task.status, to: 'IN_PROGRESS' }
  })
}
