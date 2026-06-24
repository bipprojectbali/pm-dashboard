import { Elysia } from 'elysia'
import { addEvidenceHandler, serveEvidenceHandler, uploadEvidenceHandler } from './evidence.handlers'

export function taskEvidenceRoutes() {
  return new Elysia()
    .post('/api/tasks/:id/evidence', addEvidenceHandler)
    .post('/api/tasks/:id/evidence/upload', uploadEvidenceHandler)
    .get('/api/evidence/:file', serveEvidenceHandler)
}
