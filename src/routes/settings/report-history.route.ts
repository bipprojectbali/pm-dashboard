import { Elysia } from 'elysia'
import { runCronNow } from '../../lib/report-cron'
import { getReportDiagnostic } from '../../lib/report-diagnose'
import { deleteReportHistory, getSendHistory, type ReportHistoryRange } from '../../lib/report-history'
import { getAdminUser, hasMcpSecretAuth } from './helpers'

export function reportHistoryRoutes() {
  return new Elysia()

    // Accepts admin session OR Bearer MCP_SECRET — safe to expose to any holder of MCP_SECRET.
    // Never returns secret values — only set/unset flags.
    .get('/api/admin/report/diagnose', async ({ request, set }) => {
      const authed = hasMcpSecretAuth(request) || (await getAdminUser(request)) !== null
      if (!authed) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      return getReportDiagnostic()
    })

    .get('/api/admin/report/send-history', async ({ request, query, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const page = Number(query.page) || 1
      const limit = Number(query.limit) || 20
      const validRanges: ReportHistoryRange[] = ['1m', '3m', 'all']
      const range: ReportHistoryRange = validRanges.includes(query.range as ReportHistoryRange)
        ? (query.range as ReportHistoryRange)
        : '1m'
      const { entries, total } = await getSendHistory({ page, limit, range })
      // backward compat: `history` alias untuk entries
      return { history: entries, entries, total, page, limit, range }
    })

    .delete('/api/admin/report/history/:id', async ({ request, params, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      if (user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Hanya SUPER_ADMIN yang bisa menghapus riwayat' }
      }
      await deleteReportHistory(params.id)
      return { ok: true }
    })

    // Jalankan cron sekarang tanpa menunggu waktu jadwal — untuk testing & debugging.
    // Guard cronLastSentDate tetap aktif; gunakan cron-reset untuk bypass.
    .post('/api/admin/report/cron-trigger', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const result = await runCronNow()
      if (!result.ok && !result.skippedReason) set.status = 502
      return result
    })
}
