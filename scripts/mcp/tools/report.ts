import { getReportDiagnostic } from '../../../src/lib/report-diagnose'
import { getSendHistory } from '../../../src/lib/report-history'
import { activateCronGuard, getCronGuardStatus, resetCronGuard, runCronNow } from '../../../src/lib/report-cron'
import { jsonText, type ToolModule } from './shared'

export const reportReadonly: ToolModule = {
  name: 'report-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'report_diagnose',
      {
        title: 'Daily report health check',
        description:
          'Diagnose why the daily Telegram report cron is or is not firing. Returns configured timezone + zoned now, schedule validity, would-fire-now flag, cooldown state, in-flight lock, and a list of blockers. Never exposes secret values.',
        inputSchema: {},
      },
      async () => jsonText(await getReportDiagnostic()),
    )

    server.registerTool(
      'report_cron_guard_status',
      {
        title: 'Cron guard status',
        description: 'Returns whether the daily cron guard is active (already sent today) or not, plus the stored date and today\'s date key in the configured timezone.',
        inputSchema: {},
      },
      async () => jsonText(await getCronGuardStatus()),
    )

    server.registerTool(
      'report_send_history',
      {
        title: 'Report send history',
        description:
          'Returns the last 20 report send attempts (cron, manual, custom) with sentAt, ok/fail, message, trigger. Useful for auditing whether automated sends are actually firing.',
        inputSchema: {},
      },
      async () => jsonText({ history: await getSendHistory() }),
    )
  },
}

export const reportAdmin: ToolModule = {
  name: 'report-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'report_cron_trigger',
      {
        title: 'Trigger cron report now',
        description:
          'Run the full cron send flow immediately without waiting for the scheduled time. Respects the cronLastSentDate guard (will not double-send on same day). Returns skippedReason="already_today" if guard is active — use report_cron_reset to clear it.',
        inputSchema: {},
      },
      async () => jsonText(await runCronNow()),
    )

    server.registerTool(
      'report_cron_reset',
      {
        title: 'Disable cron daily guard',
        description: 'Clears cronLastSentDate so the cron can send again today. Use to re-test or re-send on the same day.',
        inputSchema: {},
      },
      async () => { await resetCronGuard(); return jsonText({ ok: true, message: 'Guard dimatikan.' }) },
    )

    server.registerTool(
      'report_cron_activate',
      {
        title: 'Activate cron daily guard',
        description: 'Sets cronLastSentDate to today so the cron will not send again today. Use to prevent an extra cron fire.',
        inputSchema: {},
      },
      async () => { await activateCronGuard(); return jsonText({ ok: true, message: 'Guard diaktifkan.' }) },
    )
  },
}
