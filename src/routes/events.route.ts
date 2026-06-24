import { Elysia } from 'elysia'
import { eventQueryRoutes } from './events/query.route'
import { eventTagsRoutes } from './events/tags.route'
import { eventWriteRoutes } from './events/write.route'

export function eventsRoutes() {
  return new Elysia()
    .use(eventTagsRoutes())
    .use(eventQueryRoutes())
    .use(eventWriteRoutes())
}
