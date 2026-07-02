import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getIp, writeAuditLog } from '../../lib/route-helpers'
import { deny, ownedTask, parseJson } from './shared'

// POST evidence (link-kind only) for the token-scoped agent surface.
// File upload (MinIO) is not exposed here — link references only.
export function agentEvidenceRoutes() {
  return new Elysia().post('/api/agent/tasks/:id/evidence', async ({ request, params, set }) => {
    const auth = await resolveAgentAuth(request)
    if (!auth.ok) return deny(set, auth.status, auth.error)
    if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
    const task = await ownedTask(params.id, auth.projectId)
    if (!task) return deny(set, 404, 'Task not found')
    const parsed = await parseJson<{ url?: string; note?: string }>(request)
    if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')
    const { url, note } = parsed.body
    if (!url?.trim()) return deny(set, 400, 'url is required')
    const evidence = await prisma.taskEvidence.create({
      data: { taskId: params.id, kind: 'LINK', url: url.trim(), note: note?.trim() ?? null },
    })
    writeAuditLog(auth.userId, 'AGENT_EVIDENCE_ADDED', `#${params.id} ${url}`, getIp(request))
    emitInvalidate('tasks', { projectId: auth.projectId })
    return { evidence }
  })
}
