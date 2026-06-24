import { Elysia } from 'elysia'
import { bulkDeleteTasksHandler, deleteTaskHandler, listTrashHandler, purgeTaskHandler, restoreTaskHandler } from './trash.handlers'

export function taskTrashRoutes() {
  return new Elysia()
    .delete('/api/tasks/:id', deleteTaskHandler)
    .post('/api/tasks/bulk-delete', bulkDeleteTasksHandler)
    .get('/api/tasks/trash', listTrashHandler)
    .post('/api/tasks/:id/restore', restoreTaskHandler)
    .delete('/api/tasks/:id/purge', purgeTaskHandler)
}
