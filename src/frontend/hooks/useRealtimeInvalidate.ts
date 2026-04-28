import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useSession } from './useAuth'

type InvalidateMessage = {
  type: 'invalidate'
  topic: string
  scope: { projectId?: string; userId?: string } | null
}

const TOPIC_KEYS: Record<string, string[][]> = {
  tasks: [['tasks'], ['task']],
  projects: [['projects'], ['project']],
  tags: [['tags']],
  milestones: [['milestones']],
  qc: [['qc']],
  notifications: [['me', 'notifications']],
}

export function useRealtimeInvalidate() {
  const qc = useQueryClient()
  const { data } = useSession()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!data?.user) return

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws/presence`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        let msg: unknown
        try {
          msg = JSON.parse(e.data)
        } catch {
          return
        }
        if (!msg || typeof msg !== 'object') return
        const m = msg as { type?: string }
        if (m.type !== 'invalidate') return
        const { topic } = msg as InvalidateMessage
        if (typeof topic !== 'string') return
        const keys = TOPIC_KEYS[topic] ?? [[topic]]
        for (const key of keys) qc.invalidateQueries({ queryKey: key })
      }

      ws.onclose = () => {
        wsRef.current = null
        reconnectTimer.current = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [data?.user?.id, qc, data?.user])
}
