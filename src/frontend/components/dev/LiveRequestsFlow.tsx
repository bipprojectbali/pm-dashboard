import { ActionIcon, Badge, Group, Text } from '@mantine/core'
import { Background, Controls, Handle, MarkerType, type Node, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { TbCircleFilled, TbTrash, TbWifi } from 'react-icons/tb'
import { FlowNode, METHOD_COLORS, projectNodeTypes } from '@/frontend/components/dev/flow-nodes'
import { LayoutSelector, storageKey, useFlowAutoSave } from '@/frontend/components/dev/flow-layout'

// suppress unused import — FlowNode referenced via liveNodeTypes
void FlowNode

interface RequestEvent {
  method: string
  path: string
  status: number
  duration: number
  timestamp: string
}

function EndpointHitNode({
  data,
}: {
  data: { method: string; path: string; hits: number; lastStatus: number; avgDuration: number }
}) {
  const statusColor = data.lastStatus >= 500 ? 'red' : data.lastStatus >= 400 ? 'yellow' : 'green'
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${statusColor}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 200,
        boxShadow:
          data.hits > 0 ? `0 0 ${Math.min(data.hits * 2, 20)}px var(--mantine-color-${statusColor}-3)` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: `var(--mantine-color-${statusColor}-6)` }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={METHOD_COLORS[data.method] || 'gray'} variant="filled">
          {data.method}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {data.path}
        </Text>
      </Group>
      <Group gap={8}>
        <Badge size="xs" variant="light" color={statusColor}>
          {data.lastStatus || '—'}
        </Badge>
        <Text size="xs" c="dimmed">
          {data.hits} hits
        </Text>
        {data.avgDuration > 0 && (
          <Text size="xs" c="dimmed">
            {data.avgDuration}ms avg
          </Text>
        )}
      </Group>
    </div>
  )
}

const liveNodeTypes = { endpoint: EndpointHitNode, flow: projectNodeTypes.flow }

function LiveRequestsFlowInner() {
  const flow = useFlowAutoSave(storageKey('live-requests'))
  const [events, setEvents] = useState<RequestEvent[]>([])
  const [paused, setPaused] = useState(false)
  const statsRef = useRef<Map<string, { hits: number; totalDuration: number; lastStatus: number }>>(new Map())
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws/presence`)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'request' && !pausedRef.current) {
          const evt: RequestEvent = msg
          setEvents((prev) => [...prev.slice(-99), evt])

          const key = `${evt.method}_${evt.path}`
          const stat = statsRef.current.get(key) || { hits: 0, totalDuration: 0, lastStatus: 200 }
          stat.hits++
          stat.totalDuration += evt.duration
          stat.lastStatus = evt.status
          statsRef.current.set(key, stat)
        }
      } catch {}
    }

    return () => ws.close()
  }, [])

  useEffect(() => {
    const nodes: Node[] = []
    const edges: any[] = []

    nodes.push({
      id: 'server',
      type: 'flow',
      position: flow.loadPos?.server ?? { x: 0, y: 200 },
      data: { label: 'Elysia Server', color: 'green', description: `${events.length} requests captured` },
    })

    const entries = Array.from(statsRef.current.entries())
    entries.forEach(([key, stat], i) => {
      const [method, ...pathParts] = key.split('_')
      const path = pathParts.join('_')
      nodes.push({
        id: key,
        type: 'endpoint',
        position: flow.loadPos?.[key] ?? { x: 350, y: i * 80 },
        data: {
          method,
          path,
          hits: stat.hits,
          lastStatus: stat.lastStatus,
          avgDuration: Math.round(stat.totalDuration / stat.hits),
        },
      })
      edges.push({
        id: `live_${key}`,
        source: 'server',
        target: key,
        style: {
          stroke: `var(--mantine-color-${stat.lastStatus >= 500 ? 'red' : stat.lastStatus >= 400 ? 'yellow' : 'green'}-4)`,
          strokeWidth: Math.min(1 + stat.hits * 0.3, 5),
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
        animated: true,
      })
    })

    flow.setNodes(nodes)
    flow.setEdges(edges)
  }, [events, flow.loadPos?.server, flow.setNodes, flow.setEdges, flow.loadPos])

  const totalHits = Array.from(statsRef.current.values()).reduce((s, v) => s + v.hits, 0)
  const errorCount = Array.from(statsRef.current.values()).filter((v) => v.lastStatus >= 400).length

  return (
    <>
      <Group px="md" pb="xs" gap="sm">
        <Badge size="sm" color="green" variant="light">
          {totalHits} requests
        </Badge>
        <Badge size="sm" color="blue" variant="light">
          {statsRef.current.size} endpoints
        </Badge>
        {errorCount > 0 && (
          <Badge size="sm" color="red" variant="light">
            {errorCount} errors
          </Badge>
        )}
        <ActionIcon
          variant={paused ? 'filled' : 'subtle'}
          size="sm"
          color={paused ? 'red' : 'green'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <TbCircleFilled size={12} /> : <TbWifi size={16} />}
        </ActionIcon>
        <Text size="xs" c="dimmed">
          {paused ? 'Paused' : 'Live'}
        </Text>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={() => {
            statsRef.current.clear()
            setEvents([])
          }}
        >
          <TbTrash size={16} />
        </ActionIcon>
        <LayoutSelector layoutKey={storageKey('live-requests')} onLayout={flow.relayout} />
      </Group>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          onNodesChange={flow.handleNodesChange}
          onEdgesChange={flow.onEdgesChange}
          onMoveEnd={flow.handleMoveEnd}
          nodeTypes={liveNodeTypes}
          defaultViewport={flow.savedVp ?? undefined}
          fitView={!flow.savedVp}
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </>
  )
}

export function LiveRequestsFlow() {
  return (
    <ReactFlowProvider>
      <LiveRequestsFlowInner />
    </ReactFlowProvider>
  )
}
