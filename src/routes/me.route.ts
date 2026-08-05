import { Elysia } from 'elysia'
import { meNotificationsRoutes } from './me/notifications.route'
import { mePreferencesRoutes } from './me/preferences.route'
import { meProfileRoutes } from './me/profile.route'
import { meSecurityRoutes } from './me/security.route'
import { meTeamRoutes } from './me/team.route'
import { meTeamActivityRoutes } from './me/team-activity.route'

export function meRoutes() {
  return new Elysia()
    .use(mePreferencesRoutes())
    .use(meSecurityRoutes())
    .use(meProfileRoutes())
    .use(meNotificationsRoutes())
    .use(meTeamRoutes())
    .use(meTeamActivityRoutes())
}
