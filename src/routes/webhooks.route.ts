import { Elysia } from 'elysia'
import { prisma } from '../lib/db'
import { env } from '../lib/env'
import { appLog } from '../lib/applog'
import { normalizeGithubRepo, verifyGithubSignature } from '../lib/github'
import { verifyWebhookToken } from '../lib/webhook-tokens'
import { getIp } from '../lib/route-helpers'

export function webhooksRoutes() {
  return new Elysia()

    // ─── pm-watch Webhook ─────────────────────────────
    .post('/webhooks/aw', async ({ request, set }) => {
      const ip = getIp(request)
      const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
      const logRequest = (
        statusCode: number,
        reason: string | null,
        tokenId: string | null,
        agentDbId: string | null,
        eventsIn: number,
      ) => {
        prisma.webhookRequestLog
          .create({ data: { statusCode, reason, tokenId, agentId: agentDbId, ip, eventsIn } })
          .catch(() => null)
      }

      if (!env.PMW_WEBHOOK_TOKEN) {
        const anyToken = await prisma.webhookToken.count()
        if (anyToken === 0) {
          logRequest(503, 'unconfigured', null, null, 0)
          set.status = 503
          return { error: 'No webhook token configured' }
        }
      }
      const auth = await verifyWebhookToken(bearer, env.PMW_WEBHOOK_TOKEN)
      if (!auth.ok) {
        appLog('warn', `pm-watch webhook ${auth.reason} from ${ip}`)
        const statusCode = auth.reason === 'unauthorized' ? 401 : 403
        logRequest(statusCode, auth.reason, auth.tokenId, null, 0)
        set.status = statusCode
        return { error: auth.reason === 'unauthorized' ? 'Unauthorized' : `Token ${auth.reason}` }
      }

      let body: {
        agent_id?: string
        hostname?: string
        os_user?: string
        events?: Array<{
          bucket_id?: string
          event_id?: number
          timestamp?: string
          duration?: number
          data?: unknown
        }>
      }
      try {
        body = (await request.json()) as typeof body
      } catch {
        logRequest(400, 'invalid_json', auth.tokenId, null, 0)
        set.status = 400
        return { error: 'Invalid JSON' }
      }

      const { agent_id, hostname, os_user } = body
      if (!agent_id || !hostname || !os_user) {
        logRequest(400, 'missing_fields', auth.tokenId, null, 0)
        set.status = 400
        return { error: 'agent_id, hostname, os_user wajib diisi' }
      }
      if (!Array.isArray(body.events)) {
        logRequest(400, 'events_not_array', auth.tokenId, null, 0)
        set.status = 400
        return { error: 'events harus array' }
      }
      if (body.events.length > env.PMW_EVENT_BATCH_MAX) {
        logRequest(413, 'batch_too_large', auth.tokenId, null, body.events.length)
        set.status = 413
        return { error: `Batch terlalu besar (max ${env.PMW_EVENT_BATCH_MAX})` }
      }

      const now = new Date()
      const agent = await prisma.agent.upsert({
        where: { agentId: agent_id },
        update: { hostname, osUser: os_user, lastSeenAt: now },
        create: { agentId: agent_id, hostname, osUser: os_user, lastSeenAt: now },
      })

      if (agent.status === 'REVOKED') {
        appLog('warn', `pm-watch events from REVOKED agent ${agent_id} rejected`)
        logRequest(403, 'agent_revoked', auth.tokenId, agent.id, body.events.length)
        set.status = 403
        return { error: 'Agent revoked' }
      }

      if (agent.status === 'PENDING') {
        appLog(
          'info',
          `pm-watch events from PENDING agent ${agent_id} dropped (awaiting approval): received=${body.events.length}`,
        )
        logRequest(202, 'agent_pending', auth.tokenId, agent.id, body.events.length)
        set.status = 202
        return {
          ok: true,
          agent: { id: agent.id, status: agent.status, claimed: false },
          received: body.events.length,
          inserted: 0,
          skipped: body.events.length,
          reason: 'agent_pending',
        }
      }

      const rows = body.events.flatMap((e) => {
        if (!e.bucket_id || typeof e.event_id !== 'number' || !e.timestamp || typeof e.duration !== 'number')
          return []
        const ts = new Date(e.timestamp)
        if (Number.isNaN(ts.getTime())) return []
        return [
          {
            agentId: agent.id,
            bucketId: e.bucket_id,
            eventId: e.event_id,
            timestamp: ts,
            duration: e.duration,
            data: (e.data ?? {}) as object,
          },
        ]
      })

      let inserted = 0
      if (rows.length > 0) {
        const { count } = await prisma.activityEvent.createMany({ data: rows, skipDuplicates: true })
        inserted = count
      }

      appLog(
        'info',
        `pm-watch /webhooks/aw ${agent_id} host=${hostname} received=${body.events.length} inserted=${inserted} status=${agent.status}`,
      )
      logRequest(200, null, auth.tokenId, agent.id, body.events.length)

      return {
        ok: true,
        agent: { id: agent.id, status: agent.status, claimed: !!agent.claimedById },
        received: body.events.length,
        inserted,
        skipped: body.events.length - inserted,
      }
    })

    // ─── GitHub Webhook ───────────────────────────────
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

      const repo = payload.repository as { full_name?: string; html_url?: string } | undefined
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

      type EventRow = {
        projectId: string
        kind: 'PUSH_COMMIT' | 'PR_OPENED' | 'PR_CLOSED' | 'PR_MERGED' | 'PR_REVIEWED'
        actorLogin: string
        actorEmail: string | null
        matchedUserId: string | null
        title: string
        url: string
        sha: string | null
        prNumber: number | null
        metadata: object | null
        createdAt: Date
      }
      const rows: EventRow[] = []

      if (event === 'push') {
        const commits = (payload.commits as Array<Record<string, unknown>>) ?? []
        const pusher = payload.pusher as { name?: string; email?: string } | undefined
        for (const c of commits) {
          const id = typeof c.id === 'string' ? c.id : null
          if (!id) continue
          const author = c.author as { name?: string; email?: string; username?: string } | undefined
          const message = typeof c.message === 'string' ? c.message : ''
          const timestamp = typeof c.timestamp === 'string' ? new Date(c.timestamp) : new Date()
          const url = typeof c.url === 'string' ? c.url : `https://github.com/${repoFullName}/commit/${id}`
          rows.push({
            projectId: project.id,
            kind: 'PUSH_COMMIT',
            actorLogin: author?.username ?? author?.name ?? pusher?.name ?? 'unknown',
            actorEmail: author?.email ?? pusher?.email ?? null,
            matchedUserId: null,
            title: message.split('\n')[0].slice(0, 500),
            url,
            sha: id,
            prNumber: null,
            metadata: {
              ref: payload.ref ?? null,
              added: c.added ?? [],
              removed: c.removed ?? [],
              modified: c.modified ?? [],
            },
            createdAt: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
          })
        }
      } else if (event === 'pull_request') {
        const action = typeof payload.action === 'string' ? payload.action : ''
        const pr = payload.pull_request as
          | {
              number?: number
              title?: string
              html_url?: string
              merged?: boolean
              user?: { login?: string }
              merged_at?: string | null
              closed_at?: string | null
              created_at?: string
            }
          | undefined
        const kind: EventRow['kind'] | null =
          action === 'opened' || action === 'reopened'
            ? 'PR_OPENED'
            : action === 'closed'
              ? pr?.merged
                ? 'PR_MERGED'
                : 'PR_CLOSED'
              : null
        if (kind && pr?.number != null) {
          const ts =
            kind === 'PR_MERGED' && pr.merged_at
              ? new Date(pr.merged_at)
              : kind === 'PR_CLOSED' && pr.closed_at
                ? new Date(pr.closed_at)
                : pr.created_at
                  ? new Date(pr.created_at)
                  : new Date()
          rows.push({
            projectId: project.id,
            kind,
            actorLogin: pr.user?.login ?? 'unknown',
            actorEmail: null,
            matchedUserId: null,
            title: (pr.title ?? '').slice(0, 500),
            url: pr.html_url ?? `https://github.com/${repoFullName}/pull/${pr.number}`,
            sha: null,
            prNumber: pr.number,
            metadata: { action, merged: pr.merged ?? false },
            createdAt: Number.isNaN(ts.getTime()) ? new Date() : ts,
          })
        }
      } else if (event === 'pull_request_review') {
        const pr = payload.pull_request as { number?: number; html_url?: string; title?: string } | undefined
        const review = payload.review as
          | { state?: string; user?: { login?: string }; submitted_at?: string }
          | undefined
        if (pr?.number != null && review) {
          const ts = review.submitted_at ? new Date(review.submitted_at) : new Date()
          rows.push({
            projectId: project.id,
            kind: 'PR_REVIEWED',
            actorLogin: review.user?.login ?? 'unknown',
            actorEmail: null,
            matchedUserId: null,
            title: `${review.state ?? 'reviewed'}: ${(pr.title ?? '').slice(0, 480)}`,
            url: pr.html_url ?? `https://github.com/${repoFullName}/pull/${pr.number}`,
            sha: null,
            prNumber: pr.number,
            metadata: { state: review.state ?? null },
            createdAt: Number.isNaN(ts.getTime()) ? new Date() : ts,
          })
        }
      }

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
              (
                await prisma.projectGithubEvent.findMany({
                  where: { projectId: project.id, kind: 'PUSH_COMMIT', sha: { in: pushShas } },
                  select: { sha: true },
                })
              )
                .map((r) => r.sha)
                .filter((s): s is string => !!s),
            )
          : new Set<string>()
        const dedupedRows = rows.filter((r) => {
          if (r.kind !== 'PUSH_COMMIT' || !r.sha) return true
          return !existingShas.has(r.sha)
        })

        if (dedupedRows.length > 0) {
          const { count } = await prisma.projectGithubEvent.createMany({
            data: dedupedRows.map((r) => ({
              projectId: r.projectId,
              kind: r.kind,
              actorLogin: r.actorLogin,
              actorEmail: r.actorEmail,
              matchedUserId: r.matchedUserId,
              title: r.title,
              url: r.url,
              sha: r.sha,
              prNumber: r.prNumber,
              metadata: r.metadata ?? undefined,
              createdAt: r.createdAt,
            })),
            skipDuplicates: true,
          })
          inserted = count
        }
      }

      appLog(
        'info',
        `github webhook event=${event} repo=${repoFullName} project=${project.id} received=${rows.length} inserted=${inserted}`,
      )
      logRequest(200, rows.length === 0 ? 'ignored_event' : null, project.id, rows.length)

      return { ok: true, event, received: rows.length, inserted }
    })
}
