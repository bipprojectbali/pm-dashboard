import { Elysia } from 'elysia'
import { auth } from '../lib/auth'
import { loginHandler, logoutHandler, sessionHandler } from './auth.handlers'

export function authRoutes() {
  return new Elysia()
    .all('/api/auth/*', async ({ request }) => auth.handler(request))
    .post('/api/auth/login', loginHandler)
    .post('/api/auth/logout', logoutHandler)
    .get('/api/auth/session', sessionHandler)
}
