import { Elysia } from 'elysia'
import { taskCreateRoute } from './task.create.route'
import { taskReadRoute } from './task.read.route'
import { taskUpdateRoute } from './task.update.route'

export function taskCrudRoutes() {
  return new Elysia()
    .use(taskCreateRoute())
    .use(taskReadRoute())
    .use(taskUpdateRoute())
}
