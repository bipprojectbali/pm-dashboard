import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { resolveTicketContent } from '../../lib/qc-ticket-template'
import { getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { ensureAiQueueTag, getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const

export function qcWriteRoutes() {
  return new Elysia()

    .post('/api/qc/tickets', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) {
        set.status = 409
        return { error: 'No self-project configured. Super-admin must set one first.' }
      }
      const body = (await request.json()) as {
        title?: string
        description?: string
        priority?: string
        route?: string
        evidenceUrls?: string[]
        stepsToReproduce?: string
        expected?: string
        actual?: string
        environment?: string
        browser?: string
        appVersion?: string
      }
      if (!body.title?.trim()) {
        set.status = 400
        return { error: 'title wajib diisi' }
      }
      const content = resolveTicketContent(body)
      if (!content.ok) {
        set.status = 400
        return { error: content.error }
      }
      const tag = await ensureAiQueueTag(selfProject.id)
      const ticket = await prisma.task.create({
        data: {
          projectId: selfProject.id,
          kind: 'BUG',
          title: body.title.trim(),
          description: content.description,
          priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
          route: body.route ?? null,
          reporterId: auth.userId,
          ...content.columns,
          tags: { create: [{ tagId: tag.id }] },
          evidence: body.evidenceUrls?.length
            ? { create: body.evidenceUrls.map((url) => ({ url, kind: 'LINK' as const })) }
            : undefined,
        },
      })
      writeAuditLog(auth.userId, 'QC_TICKET_CREATED', `#${ticket.id} ${ticket.title}`, getIp(request))
      appLog('info', `QC ticket created: ${ticket.title} by ${auth.email}`)
      emitInvalidate('qc')
      return { ticket }
    })
}
