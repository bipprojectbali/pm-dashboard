import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { Elysia } from 'elysia'
import pkg from '../package.json' with { type: 'json' }
import { appLog } from './lib/applog'
import { broadcastToAdmins } from './lib/presence'
import { activityRoutes } from './routes/activity.route'
import { adminRoutes } from './routes/admin.route'
import { authRoutes } from './routes/auth.route'
import { meRoutes } from './routes/me.route'
import { projectsRoutes } from './routes/projects.route'
import { qcRoutes } from './routes/qc.route'
import { tasksRoutes } from './routes/tasks.route'
import { webhooksRoutes } from './routes/webhooks.route'

export function createApp() {
  appLog('info', 'Server starting')

  return new Elysia()
    .use(cors())
    .use(html())

    .onError(({ code, error, request }) => {
      if (code === 'NOT_FOUND') {
        return new Response(JSON.stringify({ error: 'Not Found', status: 404 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const url = new URL(request.url)
      const message = error instanceof Error ? error.message : String(error)
      appLog('error', `${request.method} ${url.pathname} — ${message}`)
      console.error('[Server Error]', error)
      return new Response(JSON.stringify({ error: 'Internal Server Error', status: 500 }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    .onRequest(({ request }) => {
      ;(request as any).__startTime = performance.now()
    })
    .onAfterResponse(({ request, set }) => {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/api/')) {
        const status = typeof set.status === 'number' ? set.status : 200
        const level = status >= 500 ? ('error' as const) : status >= 400 ? ('warn' as const) : ('info' as const)
        appLog(level, `${request.method} ${url.pathname} ${status}`)
        const duration = Math.round(performance.now() - ((request as any).__startTime || 0))
        broadcastToAdmins({
          type: 'request',
          method: request.method,
          path: url.pathname,
          status,
          duration,
          timestamp: new Date().toISOString(),
        })
      }
    })

    .get('/health', () => ({ status: 'ok' }))
    .get('/api/version', () => ({
      name: pkg.name,
      version: pkg.version,
      commit: process.env.GIT_COMMIT ?? null,
      builtAt: process.env.BUILT_AT ?? null,
      env: process.env.NODE_ENV ?? 'development',
    }))
    .get('/api/hello', () => ({ message: 'Hello, world!', method: 'GET' }))
    .put('/api/hello', () => ({ message: 'Hello, world!', method: 'PUT' }))
    .get('/api/hello/:name', ({ params }) => ({ message: `Hello, ${params.name}!` }))

    .use(authRoutes())
    .use(adminRoutes())
    .use(qcRoutes())
    .use(projectsRoutes())
    .use(tasksRoutes())
    .use(activityRoutes())
    .use(meRoutes())
    .use(webhooksRoutes())
}
