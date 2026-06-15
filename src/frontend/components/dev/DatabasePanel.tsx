import { ActionIcon, Badge, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { getLayoutedElements, LayoutSelector } from '@/frontend/components/dev/flow-layout'

interface SchemaField {
  name: string
  type: string
  isId: boolean
  isUnique: boolean
  isOptional: boolean
  isList: boolean
  isRelation: boolean
  default?: string
}

interface SchemaModel {
  name: string
  tableName: string
  fields: SchemaField[]
}

interface SchemaEnum {
  name: string
  values: string[]
}

interface SchemaRelation {
  from: string
  fromField: string
  to: string
  toField: string
  onDelete?: string
}

interface ParsedSchema {
  models: SchemaModel[]
  enums: SchemaEnum[]
  relations: SchemaRelation[]
}

function ModelNode({ data }: { data: { label: string; tableName: string; fields: SchemaField[] } }) {
  return (
    <div
      style={{
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 8,
        minWidth: 240,
        fontSize: 12,
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <div
        style={{
          padding: '8px 12px',
          fontWeight: 700,
          fontSize: 13,
          borderBottom: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-blue-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{data.label}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{data.tableName}</span>
      </div>
      <div style={{ padding: '4px 0' }}>
        {data.fields
          .filter((f) => !f.isRelation)
          .map((field) => (
            <div
              key={field.name}
              style={{
                padding: '3px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                alignItems: 'center',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {field.isId && (
                  <span style={{ color: 'var(--mantine-color-yellow-6)' }} title="Primary Key">
                    PK
                  </span>
                )}
                {field.isUnique && !field.isId && (
                  <span style={{ color: 'var(--mantine-color-teal-6)' }} title="Unique">
                    UQ
                  </span>
                )}
                {!field.isId && !field.isUnique && <span style={{ width: 16 }} />}
                <span>{field.name}</span>
              </span>
              <span style={{ opacity: 0.5 }}>
                {field.type}
                {field.isOptional ? '?' : ''}
              </span>
            </div>
          ))}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-blue-6)' }} />
    </div>
  )
}

function EnumNode({ data }: { data: { label: string; values: string[] } }) {
  return (
    <div
      style={{
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 8,
        minWidth: 160,
        fontSize: 12,
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          fontWeight: 700,
          fontSize: 13,
          borderBottom: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-violet-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{data.label}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>enum</span>
      </div>
      <div style={{ padding: '4px 0' }}>
        {data.values.map((v) => (
          <div key={v} style={{ padding: '3px 12px' }}>
            {v}
          </div>
        ))}
      </div>
    </div>
  )
}

const nodeTypes = { model: ModelNode, enum: EnumNode }
const STORAGE_KEY = 'dev:schema:positions'
const VIEWPORT_KEY = 'dev:schema:viewport'

function savePositions(nodes: Node[]) {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    positions[n.id] = n.position
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
}

function loadPositions(): Record<string, { x: number; y: number }> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveViewport(viewport: { x: number; y: number; zoom: number }) {
  localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport))
}

function loadViewport(): { x: number; y: number; zoom: number } | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

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
