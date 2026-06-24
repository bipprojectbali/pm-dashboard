import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { ChatMessage, ChatSource, SyncResult, ToolCall } from './types'

export function useChatStream() {
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [systemContext, setSystemContext] = useState<string | null>(null)
  const [contextLoadedAt, setContextLoadedAt] = useState<Date | null>(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStream, setCurrentStream] = useState('')
  const [currentSources, setCurrentSources] = useState<ChatSource[]>([])
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([])
  const [phase, setPhase] = useState('')
  const [docsCount, setDocsCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const syncStatusQ = useQuery<{ totalDocuments: number; lastSync: string | null }>({
    queryKey: ['admin', 'chat', 'sync-status'],
    queryFn: () => fetch('/api/admin/chat/sync/status', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 5 * 60_000,
  })

  const syncMutation = useMutation<SyncResult>({
    mutationFn: () =>
      fetch('/api/admin/chat/sync', { method: 'POST', credentials: 'include' }).then((r) =>
        r.json(),
      ) as Promise<SyncResult>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'chat', 'sync-status'] }),
  })

  // Re-render every 30s so "X menit lalu" age label stays accurate
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setIsStreaming(true)
      setCurrentStream('')
      setCurrentSources([])
      setCurrentToolCalls([])
      setPhase('')
      setDocsCount(0)
      setError(null)

      try {
        const res = await fetch('/api/admin/chat/stream', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
            systemContext,
          }),
        })
        if (!res.ok) {
          setError(`HTTP ${res.status}`)
          return
        }

        const reader = res.body!.getReader()
        const dec = new TextDecoder()
        let buf = ''
        let accumulated = ''
        let newContext: string | null = null
        let collectedSources: ChatSource[] = []
        let collectedToolCalls: ToolCall[] = []

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
              const data = JSON.parse(eventData)
              if (eventName === 'system') newContext = data.context
              else if (eventName === 'phase') setPhase(data.label)
              else if (eventName === 'docs') setDocsCount(data.count)
              else if (eventName === 'sources') {
                collectedSources = data.sources ?? []
                setCurrentSources(collectedSources)
              } else if (eventName === 'tool_use') {
                const newCall: ToolCall = { id: data.id, name: data.name, input: data.input, pending: true }
                collectedToolCalls = [...collectedToolCalls, newCall]
                setCurrentToolCalls(collectedToolCalls)
              } else if (eventName === 'tool_result') {
                collectedToolCalls = collectedToolCalls.map((c) =>
                  c.id === data.id ? { ...c, pending: false, result: data.result } : c,
                )
                setCurrentToolCalls(collectedToolCalls)
              } else if (eventName === 'token') {
                accumulated += data.text
                setCurrentStream(accumulated)
              } else if (eventName === 'done') {
                const final = data.full || accumulated
                const finalSources = (data.sources as ChatSource[] | undefined) ?? collectedSources
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: final,
                    sources: finalSources,
                    toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
                  },
                ])
                setCurrentStream('')
                setCurrentSources([])
                setCurrentToolCalls([])
                if (newContext) {
                  setSystemContext(newContext)
                  setContextLoadedAt(new Date())
                }
              } else if (eventName === 'error') setError(data.message)
            } catch {
              /* ignore malformed SSE frames */
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Koneksi gagal')
      } finally {
        setIsStreaming(false)
        setCurrentStream('')
        setCurrentSources([])
        setCurrentToolCalls([])
        setPhase('')
      }
    },
    [messages, systemContext, isStreaming],
  )

  const resetSession = () => {
    setMessages([])
    setSystemContext(null)
    setContextLoadedAt(null)
    setCurrentStream('')
    setCurrentSources([])
    setCurrentToolCalls([])
    setError(null)
    setPhase('')
  }

  const refreshContext = () => {
    setSystemContext(null)
    setContextLoadedAt(null)
  }

  return {
    messages,
    systemContext,
    contextLoadedAt,
    input,
    setInput,
    isStreaming,
    currentStream,
    currentSources,
    currentToolCalls,
    phase,
    docsCount,
    error,
    syncStatusQ,
    syncMutation,
    sendMessage,
    resetSession,
    refreshContext,
  }
}
