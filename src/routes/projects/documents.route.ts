import Elysia from 'elysia'
import {
  deleteProjectDocumentHandler,
  listProjectDocumentsHandler,
  serveProjectDocumentHandler,
  uploadProjectDocumentHandler,
} from './documents.handlers'

export function projectDocumentRoutes() {
  return new Elysia()
    .get('/api/projects/:id/documents', listProjectDocumentsHandler)
    .post('/api/projects/:id/documents/upload', uploadProjectDocumentHandler)
    .get('/api/projects/:id/documents/:docId/file', serveProjectDocumentHandler)
    .delete('/api/projects/:id/documents/:docId', deleteProjectDocumentHandler)
}
