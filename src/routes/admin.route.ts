import { Elysia } from 'elysia'
import { adminDevCodeRoutes } from './admin/dev-code.route'
import { adminDevEnvRoutes } from './admin/dev-env.route'
import { adminDevGraphRoutes } from './admin/dev-graph.route'
import { adminDevInspectRoutes } from './admin/dev-inspect.route'
import { adminHealthRoutes } from './admin/health.route'
import { adminLogsRoutes } from './admin/logs.route'
import { adminOverviewRoutes } from './admin/overview.route'
import { adminPresenceRoutes } from './admin/presence.route'
import { adminReportRoutes } from './admin/report.route'
import { adminReportUserRoutes } from './admin/report-user.route'
import { adminSelfProjectRoutes } from './admin/self-project.route'
import { adminSessionsRoutes } from './admin/sessions.route'
import { adminSyncRoutes } from './admin/sync.route'
import { adminUsersRoutes } from './admin/users.route'

export function adminRoutes() {
  return new Elysia()
    .use(adminUsersRoutes())
    .use(adminPresenceRoutes())
    .use(adminLogsRoutes())
    .use(adminDevCodeRoutes())
    .use(adminDevInspectRoutes())
    .use(adminDevEnvRoutes())
    .use(adminDevGraphRoutes())
    .use(adminSessionsRoutes())
    .use(adminHealthRoutes())
    .use(adminOverviewRoutes())
    .use(adminSelfProjectRoutes())
    .use(adminReportRoutes())
    .use(adminReportUserRoutes())
    .use(adminSyncRoutes())
}
