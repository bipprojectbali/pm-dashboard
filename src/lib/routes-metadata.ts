export type { RouteMetadata } from './routes-metadata/types'
import { ADMIN_ROUTES } from './routes-metadata/admin'
import { AUTH_ROUTES } from './routes-metadata/auth'
import { FRONTEND_ROUTES } from './routes-metadata/frontend'
import { GITHUB_ROUTES, UTILITY_ROUTES } from './routes-metadata/misc'
import { PROJECT_ROUTES } from './routes-metadata/projects'
import { TASK_ROUTES } from './routes-metadata/tasks'
import { USER_ROUTES } from './routes-metadata/user'

export const ROUTES_METADATA = [
  ...FRONTEND_ROUTES,
  ...AUTH_ROUTES,
  ...ADMIN_ROUTES,
  ...USER_ROUTES,
  ...PROJECT_ROUTES,
  ...TASK_ROUTES,
  ...GITHUB_ROUTES,
  ...UTILITY_ROUTES,
]
