import Elysia from 'elysia'
import {
  createPhaseHandler,
  deletePhaseHandler,
  listAllPhasesHandler,
  listProjectPhasesHandler,
  updatePhaseHandler,
} from './phases.handlers'

export function phasesRoutes() {
  return new Elysia()
    .get('/api/phases', listAllPhasesHandler)
    .get('/api/projects/:id/phases', listProjectPhasesHandler)
    .post('/api/projects/:id/phases', createPhaseHandler)
    .patch('/api/phases/:id', updatePhaseHandler)
    .delete('/api/phases/:id', deletePhaseHandler)
}
