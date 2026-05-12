import { Elysia } from 'elysia'
import { generateAndSendDailyReport, generateReportPreview } from '../lib/daily-report'
import { getAllSettings, setSetting } from '../lib/app-settings'
import { extractSessionToken, isSystemAdmin } from '../lib/route-helpers'
import { prisma } from '../lib/db'

const SENSITIVE_KEYS = ['ai.anthropicApiKey', 'telegram.botToken']

function maskSensitive(settings: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    result[key] = SENSITIVE_KEYS.includes(key) && value ? '***' : value
  }
  return result
}

async function getAdminUser(request: Request) {
  const cookie = request.headers.get('cookie') ?? ''
  const token = extractSessionToken(cookie)
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, role: true } } },
  })
  if (!session || session.expiresAt < new Date() || !isSystemAdmin(session.user.role)) return null
  return session.user
}

export function settingsRoutes() {
  return new Elysia()

    .get('/api/admin/app-settings', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      const settings = await getAllSettings()
      return { settings: maskSensitive(settings) }
    })

    .put('/api/admin/app-settings', async ({ request, set, body }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      const { key, value } = body as { key: string; value: string }
      if (!key || typeof key !== 'string') { set.status = 400; return { error: 'key required' } }
      if (typeof value !== 'string') { set.status = 400; return { error: 'value must be string' } }
      if (SENSITIVE_KEYS.includes(key) && value === '***') return { ok: true, skipped: true }
      await setSetting(key, value, user.id)
      return { ok: true }
    })

    .post('/api/admin/report/send-now', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      const result = await generateAndSendDailyReport()
      if (!result.ok) set.status = 502
      return result
    })

    .get('/api/admin/report/preview', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      try {
        const text = await generateReportPreview()
        return { ok: true, text }
      } catch (e) {
        set.status = 502
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })
}
