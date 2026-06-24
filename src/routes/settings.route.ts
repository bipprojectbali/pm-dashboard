import { Elysia } from 'elysia'
import { appSettingsRoutes } from './settings/app-settings.route'
import { chatAdminRoutes } from './settings/chat-admin.route'
import { permissionRulesRoutes } from './settings/permission-rules.route'
import { reportHistoryRoutes } from './settings/report-history.route'
import { reportOpsRoutes } from './settings/report-ops.route'
import { reportStreamRoutes } from './settings/report-stream.route'
import { reportTestRoutes } from './settings/report-test.route'

export function settingsRoutes() {
  return new Elysia()
    .use(appSettingsRoutes())
    .use(reportTestRoutes())
    .use(reportOpsRoutes())
    .use(reportStreamRoutes())
    .use(reportHistoryRoutes())
    .use(chatAdminRoutes())
    .use(permissionRulesRoutes())
}
