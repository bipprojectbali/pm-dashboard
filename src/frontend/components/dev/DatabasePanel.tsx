import { ActionIcon, Badge, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { getLayoutedElements, LayoutSelector } from '@/frontend/components/dev/flow-layout'
import { nodeTypes } from './databasepanel/nodes'
import { STORAGE_KEY, VIEWPORT_KEY, loadPositions, loadViewport, savePositions, saveViewport } from './databasepanel/storage'
import type { ParsedSchema } from './databasepanel/types'

function DatabasePanelInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'schema'],
    queryFn: () =>
      fetch('/api/admin/schema', { credentials: 'include' }).then((r) => r.json()) as Promise<{ schema: ParsedSchema }>,
  })

  const schema = data?.schema
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const { fitView: fitViewDb } = useReactFlow()
  const savedViewport = useMemo(() => loadViewport(), [])

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!schema) return { initialNodes: [], initialEdges: [] }

    const saved = loadPositions()
    const nodes: Node[] = []
    const edges: Edge[] = []

    const cols = Math.ceil(Math.sqrt(schema.models.length + schema.enums.length))

    schema.models.forEach((model, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const defaultPos = { x: col * 340, y: row * 300 }
      nodes.push({
        id: model.name,
        type: 'model',
        position: saved?.[model.name] ?? defaultPos,
        data: { label: model.name, tableName: model.tableName, fields: model.fields },
      })
    })

    schema.enums.forEach((en, i) => {
      const totalModels = schema.models.length
      const idx = totalModels + i
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const id = `enum_${en.name}`
      const defaultPos = { x: col * 340, y: row * 300 }
      nodes.push({
        id,
        type: 'enum',
        position: saved?.[id] ?? defaultPos,
        data: { label: en.name, values: en.values },
      })
    })

    schema.relations.forEach((rel, i) => {
      edges.push({
        id: `rel_${i}`,
        source: rel.from,
        target: rel.to,
        sourceHandle: null,
        targetHandle: null,
        label: `${rel.fromField} → ${rel.toField}${rel.onDelete ? ` (${rel.onDelete})` : ''}`,
        labelStyle: { fontSize: 10, fontFamily: 'monospace' },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { stroke: 'var(--mantine-color-blue-6)', strokeWidth: 1.5 },
        animated: true,
      })
    })

    return { initialNodes: nodes, initialEdges: edges }
  }, [schema])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setEdges, setNodes])

  const handleMoveEnd = useCallback((_event: any, viewport: { x: number; y: number; zoom: number }) => {
    clearTimeout(viewportTimer.current)
    viewportTimer.current = setTimeout(() => saveViewport(viewport), 500)
  }, [])

  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setNodes((current) => {
          savePositions(current)
          return current
        })
      }, 500)
    },
    [onNodesChange, setNodes],
  )

  if (isLoading) {
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">Loading schema...</Text>
      </Stack>
    )
  }

  if (!schema) {
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">Schema not found</Text>
      </Stack>
    )
  }

  return (
    <Stack gap={0} h="calc(100vh - 32px)">
      <Group justify="space-between" px="md" py="xs">
        <Group gap="sm">
          <Title order={3}>Database Schema</Title>
          <Badge variant="light" size="sm">
            {schema.models.length} models
          </Badge>
          <Badge variant="light" color="violet" size="sm">
            {schema.enums.length} enums
          </Badge>
          <Badge variant="light" color="blue" size="sm">
            {schema.relations.length} relations
          </Badge>
        </Group>
        <LayoutSelector
          layoutKey={STORAGE_KEY}
          onLayout={(layout) => {
            getLayoutedElements(nodes, edges, layout).then(({ nodes: laid }) => {
              setNodes(laid)
              localStorage.removeItem(STORAGE_KEY)
              localStorage.removeItem(VIEWPORT_KEY)
              const pos: Record<string, { x: number; y: number }> = {}
              for (const n of laid) pos[n.id] = n.position
              localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
              requestAnimationFrame(() => fitViewDb({ padding: 0.2 }))
            })
          }}
        />
        <Tooltip label="Reload schema">
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'schema'] })}
          >
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onMoveEnd={handleMoveEnd}
          nodeTypes={nodeTypes}
          defaultViewport={savedViewport ?? undefined}
          fitView={!savedViewport}
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </Stack>
  )
}

export function DatabasePanel() {
  return (
    <ReactFlowProvider>
      <DatabasePanelInner />
    </ReactFlowProvider>
  )
}
