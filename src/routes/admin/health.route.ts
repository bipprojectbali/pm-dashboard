import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { env } from '../../lib/env'
import { getOnlineUserIds } from '../../lib/presence'
import { redis } from '../../lib/redis'
import { isSystemAdmin, requireAuth } from '../../lib/route-helpers'

export function adminHealthRoutes() {
  return (
    new Elysia()

      .get('/api/admin/health', async ({ request, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!isSystemAdmin(auth.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const now = Date.now()

        const dbStart = Date.now()
        let dbOk = false
        let dbLatencyMs: number | null = null
        let dbError: string | null = null
        try {
          await prisma.$queryRawUnsafe('SELECT 1')
          dbOk = true
          dbLatencyMs = Date.now() - dbStart
        } catch (e) {
          dbError = e instanceof Error ? e.message : 'unknown'
        }

        const redisStart = Date.now()
        let redisOk = false
        let redisLatencyMs: number | null = null
        let redisError: string | null = null
        try {
          await redis.send('PING', [])
          redisOk = true
          redisLatencyMs = Date.now() - redisStart
        } catch (e) {
          redisError = e instanceof Error ? e.message : 'unknown'
        }

        const [sessionsTotal, sessionsActive, auditLogCount] = await Promise.all([
          prisma.session.count(),
          prisma.session.count({ where: { expiresAt: { gt: new Date(now) } } }),
          prisma.auditLog.count(),
        ])

        // Keep `required: true` entries in sync with the required() calls in
        // src/lib/env.ts — those crash-fast the app at boot if unset, so the
        // health card must surface them (BETTER_AUTH_SECRET + MINIO_* were the gap).
        const envChecks: { key: string; set: boolean; required: boolean }[] = [
          { key: 'DATABASE_URL', set: !!Bun.env.DATABASE_URL, required: true },
          { key: 'REDIS_URL', set: !!Bun.env.REDIS_URL, required: true },
          { key: 'GOOGLE_CLIENT_ID', set: !!Bun.env.GOOGLE_CLIENT_ID, required: true },
          { key: 'GOOGLE_CLIENT_SECRET', set: !!Bun.env.GOOGLE_CLIENT_SECRET, required: true },
          { key: 'BETTER_AUTH_SECRET', set: !!Bun.env.BETTER_AUTH_SECRET, required: true },
          { key: 'MINIO_ENDPOINT', set: !!Bun.env.MINIO_ENDPOINT, required: true },
          { key: 'MINIO_ACCESS_KEY', set: !!Bun.env.MINIO_ACCESS_KEY, required: true },
          { key: 'MINIO_SECRET_KEY', set: !!Bun.env.MINIO_SECRET_KEY, required: true },
          { key: 'GITHUB_WEBHOOK_SECRET', set: !!Bun.env.GITHUB_WEBHOOK_SECRET, required: false },
          { key: 'MCP_SECRET', set: !!Bun.env.MCP_SECRET, required: false },
          { key: 'SUPER_ADMIN_EMAIL', set: !!Bun.env.SUPER_ADMIN_EMAIL, required: false },
        ]

        return {
          timestamp: new Date(now).toISOString(),
          services: {
            db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
            redis: { ok: redisOk, latencyMs: redisLatencyMs, error: redisError },
          },
          sessions: { total: sessionsTotal, active: sessionsActive, online: getOnlineUserIds().length },
          retention: { auditLogDays: env.AUDIT_LOG_RETENTION_DAYS, auditLogCount },
          env: envChecks,
        }
      })
  )
}
