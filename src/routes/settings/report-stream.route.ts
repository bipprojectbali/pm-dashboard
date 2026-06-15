import { Elysia } from 'elysia'
import { getSetting } from '../../lib/app-settings'
import { buildPromptOnly } from '../../lib/daily-report'
import { getAdminUser } from './helpers'

export function reportStreamRoutes() {
  return new Elysia()

    .get('/api/admin/report/preview/stream', async ({ request }) => {
      const user = await getAdminUser(request)
      if (!user) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const enc = new TextEncoder()
      const sse = (event: string, data: object) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

      const stream = new ReadableStream({
        async start(ctrl) {
          const send = (event: string, data: object) => {
            try {
              ctrl.enqueue(sse(event, data))
            } catch {
              /* client disconnected */
            }
          }
          try {
            send('phase', { label: 'Mengambil data dashboard...' })

            const [apiKey, model, baseUrl, timeoutRaw] = await Promise.all([
              getSetting('ai.anthropicApiKey'),
              getSetting('ai.model'),
              getSetting('ai.baseUrl'),
              getSetting('ai.timeoutSeconds'),
            ])

            if (!apiKey) {
              send('error', { message: 'Anthropic API key belum dikonfigurasi' })
              ctrl.close()
              return
            }

            const prompt = await buildPromptOnly()
            const timeoutMs = (Number(timeoutRaw) || 120) * 1000
            const endpoint = (baseUrl as string)
              ? `${(baseUrl as string).replace(/\/$/, '')}/v1/messages`
              : 'https://api.anthropic.com/v1/messages'

            send('phase', { label: 'Mengirim ke Claude AI...' })

            const res = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'x-api-key': apiKey as string,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: (model as string) ?? 'claude-opus-4-7',
                max_tokens: 2048,
                stream: true,
                messages: [{ role: 'user', content: prompt }],
              }),
              signal: AbortSignal.timeout(timeoutMs),
            })

            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
              send('error', { message: `Claude API error ${res.status}: ${err.error?.message ?? 'unknown'}` })
              ctrl.close()
              return
            }

            send('phase', { label: 'Menerima respons Claude...' })

            const reader = res.body!.getReader()
            const dec = new TextDecoder()
            let buf = ''
            let full = ''

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buf += dec.decode(value, { stream: true })

              const parts = buf.split('\n\n')
              buf = parts.pop() ?? ''

              for (const part of parts) {
                let data = ''
                for (const line of part.split('\n')) {
                  if (line.startsWith('data: ')) data = line.slice(6)
                }
                if (!data || data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data) as {
                    type: string
                    delta?: { type: string; text: string }
                  }
                  if (
                    parsed.type === 'content_block_delta' &&
                    parsed.delta?.type === 'text_delta' &&
                    parsed.delta.text
                  ) {
                    full += parsed.delta.text
                    send('token', { text: parsed.delta.text })
                  }
                } catch {
                  /* ignore malformed SSE chunk */
                }
              }
            }

            send('done', { full })
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
}
