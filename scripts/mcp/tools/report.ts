import { getReportDiagnostic } from '../../../src/lib/report-diagnose'
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
  },
}
