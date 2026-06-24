import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { env } from '../../lib/env'
import { isExtensionEnabled } from '../../lib/extensions'
import { normalizeGithubRepo, verifyGithubSignature } from '../../lib/github'
import { getIp } from '../../lib/route-helpers'
import { parseGithubEvents } from './github-parse'

export function githubWebhookRoute() {
  return new Elysia()

    .post('/webhooks/aw', async ({ set }) => {
      set.status = 410
      return { error: 'pm-watch integration has been removed' }
    })

    .post('/webhooks/github', async ({ request, set }) => {
      const ip = getIp(request)
      const deliveryId = request.headers.get('x-github-delivery')
      const event = request.headers.get('x-github-event') ?? 'unknown'
      const signature = request.headers.get('x-hub-signature-256')

      const logRequest = (statusCode: number, reason: string | null, projectId: string | null, eventsIn: number) => {
        prisma.githubWebhookLog
          .create({ data: { statusCode, reason, projectId, deliveryId, event, ip, eventsIn } })
          .catch(() => null)
      }

      if (!(await isExtensionEnabled('github'))) {
        logRequest(200, 'extension_disabled', null, 0)
        return { ok: true, skipped: true, reason: 'extension_disabled' }
      }

      if (!env.GITHUB_WEBHOOK_SECRET) {
        logRequest(503, 'unconfigured', null, 0)
        set.status = 503
        return { error: 'GitHub webhook not configured' }
      }

      const rawBody = await request.text()
      if (!verifyGithubSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET)) {
        logRequest(401, 'bad_signature', null, 0)
        set.status = 401
        return { error: 'Invalid signature' }
      }

      if (event === 'ping') {
        logRequest(200, 'ping', null, 0)
        return { ok: true, pong: true }
      }

      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>
      } catch {
        logRequest(400, 'invalid_json', null, 0)
        set.status = 400
        return { error: 'Invalid JSON' }
      }

      const repo = payload.repository as { full_name?: string } | undefined
      const repoFullName = repo?.full_name ? normalizeGithubRepo(repo.full_name) : null
      if (!repoFullName) {
        logRequest(400, 'missing_repo', null, 0)
        set.status = 400
        return { error: 'Missing repository.full_name' }
      }

      const project = await prisma.project.findUnique({ where: { githubRepo: repoFullName } })
      if (!project) {
        logRequest(404, 'project_not_linked', null, 0)
        set.status = 404
        return { error: `No project linked to ${repoFullName}` }
      }

      const rows = parseGithubEvents(event, payload, repoFullName, project.id)

      let inserted = 0
      if (rows.length > 0) {
        const emails = [...new Set(rows.map((r) => r.actorEmail).filter((e): e is string => !!e))]
        const users = emails.length
          ? await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } })
          : []
        const emailToUser = new Map(users.map((u) => [u.email.toLowerCase(), u.id]))
        for (const r of rows) {
          if (r.actorEmail) r.matchedUserId = emailToUser.get(r.actorEmail.toLowerCase()) ?? null
        }

        // Postgres treats NULL prNumber as distinct on the unique index, so `skipDuplicates`
        // misses PUSH_COMMIT replays. Pre-filter against existing (projectId, sha) pairs.
        const pushShas = rows.filter((r) => r.kind === 'PUSH_COMMIT' && r.sha).map((r) => r.sha as string)
        const existingShas = pushShas.length
          ? new Set(
              (await prisma.projectGithubEvent.findMany({
                where: { projectId: project.id, kind: 'PUSH_COMMIT', sha: { in: pushShas } },
                select: { sha: true },
              })).map((r) => r.sha).filter((s): s is string => !!s),
            )
          : new Set<string>()
        const dedupedRows = rows.filter((r) => r.kind !== 'PUSH_COMMIT' || !r.sha || !existingShas.has(r.sha))

        if (dedupedRows.length > 0) {
          const { count } = await prisma.projectGithubEvent.createMany({
            data: dedupedRows.map((r) => ({
              projectId: r.projectId, kind: r.kind, actorLogin: r.actorLogin,
              actorEmail: r.actorEmail, matchedUserId: r.matchedUserId, title: r.title,
              url: r.url, sha: r.sha, prNumber: r.prNumber,
              metadata: r.metadata ?? undefined, createdAt: r.createdAt,
            })),
            skipDuplicates: true,
          })
          inserted = count
        }
      }

      appLog('info', `github webhook event=${event} repo=${repoFullName} project=${project.id} received=${rows.length} inserted=${inserted}`)
      logRequest(200, rows.length === 0 ? 'ignored_event' : null, project.id, rows.length)
      return { ok: true, event, received: rows.length, inserted }
    })
}
