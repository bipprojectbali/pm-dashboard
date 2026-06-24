import { Elysia } from 'elysia'
import { getSetting } from '../../lib/app-settings'
import { buildChatContext, type ChatMessage, retrieveRelevantDocs, streamChatSSE } from '../../lib/chat'
import { getChatSyncStatus, syncChatDocuments } from '../../lib/chat-documents'
import { isExtensionEnabled } from '../../lib/extensions'
import { getAdminUser } from './helpers'

export function chatAdminRoutes() {
  return new Elysia()

    .post('/api/admin/chat/stream', async ({ request }) => {
      const user = await getAdminUser(request)
      if (!user) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (!(await isExtensionEnabled('chat'))) {
        return new Response(JSON.stringify({ error: 'Extension disabled', extension: 'chat' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const enc = new TextEncoder()
      const sse = (event: string, data: object) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

      const body = (await request.json()) as {
        messages: ChatMessage[]
        systemContext?: string | null
      }
      const { messages, systemContext: cachedContext } = body

      const [apiKey, model, baseUrl, timeoutRaw] = await Promise.all([
        getSetting('ai.anthropicApiKey'),
        getSetting('ai.model'),
        getSetting('ai.baseUrl'),
        getSetting('ai.timeoutSeconds'),
      ])

      const stream = new ReadableStream({
        async start(ctrl) {
          const send = (event: string, data: object) => {
            try {
              ctrl.enqueue(sse(event, data))
            } catch {
              /* disconnected */
            }
          }
          try {
            if (!apiKey) {
              send('error', { message: 'Anthropic API key belum dikonfigurasi. Atur di tab AI & Laporan.' })
              return
            }

            let systemContext = cachedContext ?? null
            if (!systemContext) {
              send('phase', { label: 'Memuat konteks proyek...' })
              systemContext = await buildChatContext()
              send('system', { context: systemContext })
            }

            const lastMsg = messages[messages.length - 1]
            send('phase', { label: 'Mencari dokumen relevan...' })
            const {
              text: relevantDocs,
              count: docsCount,
              sources,
            } = await retrieveRelevantDocs(lastMsg?.content ?? '')
            if (docsCount > 0) send('docs', { count: docsCount })

            send('phase', { label: 'Menghubungi Claude AI...' })
            await streamChatSSE(
              {
                apiKey: apiKey as string,
                model: (model as string) ?? 'claude-opus-4-7',
                baseUrl: baseUrl as string | undefined,
                timeoutMs: (Number(timeoutRaw) || 120) * 1000,
                systemContext,
                messages,
                relevantDocs: relevantDocs || undefined,
                sources,
              },
              ctrl,
            )
          } catch (e) {
            try {
              ctrl.enqueue(sse('error', { message: e instanceof Error ? e.message : String(e) }))
            } catch {
              /* ignore */
            }
          } finally {
            try {
              ctrl.close()
            } catch {
              /* ignore */
            }
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    })

    .get('/api/admin/chat/sync/status', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      return getChatSyncStatus()
    })

    .post('/api/admin/chat/sync', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      if (!(await isExtensionEnabled('chat'))) {
        set.status = 503
        return { error: 'Extension disabled', extension: 'chat' }
      }
      const start = Date.now()
      const result = await syncChatDocuments({ full: true })
      return { ok: true, ...result, duration: Date.now() - start }
    })
}
