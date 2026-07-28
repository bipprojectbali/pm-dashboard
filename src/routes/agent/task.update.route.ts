import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { deny, enrich, LIST_INCLUDE, ownedTask, parseJson } from './shared'
import {
  type AgentTaskUpdateBody,
  applyAgentTaskUpdateSideEffects,
  buildAgentTaskUpdateData,
} from './task.update.helpers'

// PATCH update for the token-scoped agent surface, with field parity vs the
// session API: tagIds, phaseId, startsAt, kind, route plus status notifications.
export function agentTaskUpdateRoutes() {
  return new Elysia().patch('/api/agent/tasks/:id', async ({ request, params, set }) => {
    const auth = await resolveAgentAuth(request)
    if (!auth.ok) return deny(set, auth.status, auth.error)
    if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
    const current = await ownedTask(params.id, auth.projectId)
    if (!current) return deny(set, 404, 'Task not found')
    if (current.kind === 'IDEA') return deny(set, 403, 'IDEA is read-only via access token')
    const parsed = await parseJson<AgentTaskUpdateBody>(request)
    if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')

    const built = await buildAgentTaskUpdateData(parsed.body, current)
    if ('error' in built) return deny(set, built.status, built.error)

    const task = await prisma.task.update({ where: { id: params.id }, data: built.data, include: LIST_INCLUDE })
    await applyAgentTaskUpdateSideEffects({ task, current, body: parsed.body, auth, request, built })
    return { task: enrich(task) }
  })
}
