import Elysia from 'elysia'
import { createProjectHandler, deleteProjectHandler, updateProjectHandler } from './write.handlers'

export function projectWriteRoutes() {
  return new Elysia()
    .post('/api/projects', createProjectHandler)
    .patch('/api/projects/:id', updateProjectHandler)
    .delete('/api/projects/:id', deleteProjectHandler)
}
