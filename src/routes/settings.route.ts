import { Elysia } from 'elysia'
import { buildPromptOnly, generateAndSendDailyReport, generateReportPreview, sendCustomReport } from '../lib/daily-report'
import { captureSnapshot, getRecentSnapshots } from '../lib/daily-snapshot'
import { getAllSettings, getSetting, setSetting } from '../lib/app-settings'
import { extractSessionToken, isSystemAdmin } from '../lib/route-helpers'
import { prisma } from '../lib/db'
import { getReportDiagnostic } from '../lib/report-diagnose'

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

function hasMcpSecretAuth(request: Request): boolean {
  const secret = process.env.MCP_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false
  const provided = header.slice('Bearer '.length).trim()
  if (provided.length !== secret.length) return false
  let mismatch = 0
  for (let i = 0; i < provided.length; i++) mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i)
  return mismatch === 0
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

    .post('/api/admin/report/test-ai', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      const [apiKey, model, baseUrl] = await Promise.all([
        getSetting('ai.anthropicApiKey'),
        getSetting('ai.model'),
        getSetting('ai.baseUrl'),
      ])
      if (!apiKey) return { ok: false, message: 'Anthropic API key belum dikonfigurasi' }
      const endpoint = baseUrl
        ? `${baseUrl.replace(/\/$/, '')}/v1/messages`
        : 'https://api.anthropic.com/v1/messages'
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: model ?? 'claude-haiku-4-5-20251001',
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Reply with: OK' }],
          }),
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
          set.status = 502
          return { ok: false, message: `Claude API error ${res.status}: ${err.error?.message ?? 'unknown'}` }
        }
        return { ok: true, message: `Koneksi Claude API berhasil (model: ${model ?? 'claude-haiku-4-5-20251001'})` }
      } catch (e) {
        set.status = 502
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    })

    .post('/api/admin/report/test-telegram', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      const [botToken, chatId] = await Promise.all([
        getSetting('telegram.botToken'),
        getSetting('telegram.chatId'),
      ])
      if (!botToken) return { ok: false, message: 'Telegram bot token belum dikonfigurasi' }
      if (!chatId) return { ok: false, message: 'Telegram chat ID belum dikonfigurasi' }
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: '✅ Test berhasil! Koneksi Telegram pm-dashboard berjalan normal.' }),
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { description?: string }
          set.status = 502
          return { ok: false, message: `Telegram error ${res.status}: ${err.description ?? 'unknown'}` }
        }
        return { ok: true, message: 'Pesan test berhasil dikirim ke Telegram' }
      } catch (e) {
        set.status = 502
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    })

    .post('/api/admin/report/send-now', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      const body = await request.json().catch(() => ({})) as { force?: boolean }
      const result = await generateAndSendDailyReport({ force: !!body.force })
      if (!result.ok && !/cooldown|berlangsung/i.test(result.message)) set.status = 502
      return result
    })

    .get('/api/admin/report/snapshots', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      const url = new URL(request.url)
      const days = Math.min(parseInt(url.searchParams.get('days') ?? '30', 10), 90)
      const snapshots = await getRecentSnapshots(days)
      return { snapshots }
    })

    .post('/api/admin/report/snapshots/capture', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      try {
        const snapshot = await captureSnapshot()
        return { ok: true, snapshot }
      } catch (e) {
        set.status = 502
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })

    .get('/api/admin/report/prompt', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      try {
        const prompt = await buildPromptOnly()
        return { ok: true, prompt }
      } catch (e) {
        set.status = 502
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })

    .post('/api/admin/report/send-custom', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) { set.status = 403; return { error: 'Forbidden' } }
      const { text, force } = await request.json() as { text?: string; force?: boolean }
      if (!text?.trim()) { set.status = 400; return { error: 'text wajib diisi' } }
      const result = await sendCustomReport(text, { force: !!force })
      if (!result.ok && !/cooldown|berlangsung/i.test(result.message)) set.status = 502
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

    // Diagnostic: accepts admin session OR Bearer MCP_SECRET (so ops can curl from anywhere).
    // Never returns secret values — only set/unset flags. Safe to expose to any holder of MCP_SECRET.
    .get('/api/admin/report/diagnose', async ({ request, set }) => {
      const authed = hasMcpSecretAuth(request) || (await getAdminUser(request)) !== null
      if (!authed) { set.status = 403; return { error: 'Forbidden' } }
      return getReportDiagnostic()
    })
}
