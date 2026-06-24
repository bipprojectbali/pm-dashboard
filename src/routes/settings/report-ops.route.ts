import { Elysia } from 'elysia'
import { buildPromptOnly, generateAndSendDailyReport, generateReportPreview, sendCustomReport } from '../../lib/daily-report'
import { captureSnapshot, getRecentSnapshots } from '../../lib/daily-snapshot'
import { getAdminUser } from './helpers'

export function reportOpsRoutes() {
  return new Elysia()

    .post('/api/admin/report/send-now', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const result = await generateAndSendDailyReport({ trigger: 'manual' })
      if (!result.ok && !/berlangsung/i.test(result.message)) set.status = 502
      return result
    })

    .get('/api/admin/report/snapshots', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const url = new URL(request.url)
      const days = Math.min(parseInt(url.searchParams.get('days') ?? '30', 10), 90)
      const snapshots = await getRecentSnapshots(days)
      return { snapshots }
    })

    .post('/api/admin/report/snapshots/capture', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
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
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
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
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const { text } = (await request.json()) as { text?: string }
      if (!text?.trim()) {
        set.status = 400
        return { error: 'text wajib diisi' }
      }
      const result = await sendCustomReport(text)
      if (!result.ok && !/berlangsung/i.test(result.message)) set.status = 502
      return result
    })

    .get('/api/admin/report/preview', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      try {
        const text = await generateReportPreview()
        return { ok: true, text }
      } catch (e) {
        set.status = 502
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })
}
