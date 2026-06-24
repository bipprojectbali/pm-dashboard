import Elysia from 'elysia'
import { getProjectHandler, listProjectsHandler, listUsersHandler } from './query.handlers'

export function projectQueryRoutes() {
  return new Elysia()
    .get('/api/users', listUsersHandler)
    .get('/api/projects', listProjectsHandler)
    .get('/api/projects/:id', getProjectHandler)
}
