import { Elysia } from 'elysia'
import { githubWebhookRoute } from './webhooks/github.route'

export function webhooksRoutes() {
  return new Elysia().use(githubWebhookRoute())
}
