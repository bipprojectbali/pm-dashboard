import { getReportDiagnostic } from '../../../src/lib/report-diagnose'
import { getSendHistory } from '../../../src/lib/report-history'
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
          'Diagnose why the daily Telegram report cron is or is not firing. Returns configured timezone + zoned now, schedule validity, would-fire-now flag, cooldown state, in-flight lock, and a list of blockers (telegram off, missing tokens, etc.). Mirrors GET /api/admin/report/diagnose. Never exposes secret values.',
        inputSchema: {},
      },
      async () => jsonText(await getReportDiagnostic()),
    )

    server.registerTool(
      'report_send_history',
      {
        title: 'Report send history',
        description:
          'Returns the last 20 report send attempts (cron, manual, custom) with sentAt timestamp, ok/fail status, message, and trigger type. Useful for auditing whether automated sends are actually firing.',
        inputSchema: {},
      },
      async () => jsonText({ history: await getSendHistory() }),
    )
  },
}
