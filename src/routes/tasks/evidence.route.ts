import { Elysia } from 'elysia'
import {
  addEvidenceHandler,
  deleteEvidenceHandler,
  serveEvidenceHandler,
  uploadEvidenceHandler,
} from './evidence.handlers'

export function taskEvidenceRoutes() {
  return new Elysia()
    .post('/api/tasks/:id/evidence', addEvidenceHandler)
    .post('/api/tasks/:id/evidence/upload', uploadEvidenceHandler)
    .delete('/api/tasks/:id/evidence/:evidenceId', deleteEvidenceHandler)
    .get('/api/evidence/:file', serveEvidenceHandler)
}
