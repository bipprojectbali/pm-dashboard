import { Elysia } from 'elysia'
import { taskBulkRoutes } from './tasks/bulk.route'
import { taskChecklistRoutes } from './tasks/checklist.route'
import { taskCommentsRoutes } from './tasks/comments.route'
import { taskCrudRoutes } from './tasks/crud.route'
import { taskDependenciesRoutes } from './tasks/dependencies.route'
import { taskEvidenceRoutes } from './tasks/evidence.route'
import { taskListRoutes } from './tasks/list.route'
import { taskStatsRoutes } from './tasks/stats.route'
import { taskTagsRoutes } from './tasks/tags.route'
import { taskTrashRoutes } from './tasks/trash.route'

export function tasksRoutes() {
  return (
    new Elysia()
      .use(taskListRoutes())
      // Register the static /api/tasks/kind-board-stats route before the CRUD
      // routes that own /api/tasks/:id, so the id param never captures it.
      .use(taskStatsRoutes())
      .use(taskBulkRoutes())
      .use(taskCrudRoutes())
      .use(taskTrashRoutes())
      .use(taskCommentsRoutes())
      .use(taskEvidenceRoutes())
      .use(taskTagsRoutes())
      .use(taskDependenciesRoutes())
      .use(taskChecklistRoutes())
  )
}
