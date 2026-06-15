import { Elysia } from 'elysia'
import { meNotificationsRoutes } from './me/notifications.route'
import { mePreferencesRoutes } from './me/preferences.route'
import { meSecurityRoutes } from './me/security.route'
import { meTeamActivityRoutes } from './me/team-activity.route'
import { meTeamRoutes } from './me/team.route'

export function meRoutes() {
  return new Elysia()
    .use(mePreferencesRoutes())
    .use(meSecurityRoutes())
    .use(meNotificationsRoutes())
    .use(meTeamRoutes())
    .use(meTeamActivityRoutes())
}
