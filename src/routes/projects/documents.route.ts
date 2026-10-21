import Elysia from 'elysia'
import {
  deleteProjectDocumentHandler,
  listProjectDocumentsHandler,
  serveProjectDocumentHandler,
  uploadProjectDocumentHandler,
} from './documents.handlers'
import { listTrashedProjectDocumentsHandler, restoreProjectDocumentHandler } from './documents.trash.handlers'

// `/documents/trash` is registered before the `:docId` routes so the static
// segment can never be matched as a document id.
export function projectDocumentRoutes() {
  return new Elysia()
    .get('/api/projects/:id/documents', listProjectDocumentsHandler)
    .get('/api/projects/:id/documents/trash', listTrashedProjectDocumentsHandler)
    .post('/api/projects/:id/documents/upload', uploadProjectDocumentHandler)
    .get('/api/projects/:id/documents/:docId/file', serveProjectDocumentHandler)
    .post('/api/projects/:id/documents/:docId/restore', restoreProjectDocumentHandler)
    .delete('/api/projects/:id/documents/:docId', deleteProjectDocumentHandler)
}
