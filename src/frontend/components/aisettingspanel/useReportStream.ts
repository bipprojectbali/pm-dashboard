import { useCallback, useRef, useState } from 'react'

export function useReportStream({ onComplete }: { onComplete: (text: string) => void }) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamPhase, setStreamPhase] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(async () => {
    setIsStreaming(true)
    setStreamPhase('Memulai...')
    setStreamingText('')
    setStreamError(null)
    setElapsed(0)
    elapsedRef.current = setInterval(() => setElapsed((v) => v + 1), 1000)

    try {
      const res = await fetch('/api/admin/report/preview/stream', { credentials: 'include' })
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })

        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          let eventName = ''
          let eventData = ''
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim()
            if (line.startsWith('data: ')) eventData = line.slice(6).trim()
          }
          if (!eventData) continue
          try {
            const data = JSON.parse(eventData) as Record<string, string>
            if (eventName === 'phase') setStreamPhase(data.label)
            else if (eventName === 'token') {
              accumulated += data.text
              setStreamingText(accumulated)
            } else if (eventName === 'done') {
              const full = data.full || accumulated
              onComplete(full)
              setStreamingText('')
              setStreamPhase(null)
            } else if (eventName === 'error') {
              setStreamError(data.message)
            }
          } catch {
            /* ignore malformed SSE frame */
          }
        }
      }
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsStreaming(false)
      setStreamPhase(null)
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current)
        elapsedRef.current = null
      }
    }
  }, [onComplete])

  return { isStreaming, streamPhase, streamingText, streamError, elapsed, start }
}
