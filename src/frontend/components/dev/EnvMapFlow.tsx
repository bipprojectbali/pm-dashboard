import { ActionIcon, Badge, Group, Stack, Text, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, type Edge, Handle, MarkerType, type Node, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { CATEGORY_COLORS, FileNode2, projectNodeTypes } from '@/frontend/components/dev/flow-nodes'
import { LayoutSelector, storageKey, useFlowAutoSave } from '@/frontend/components/dev/flow-layout'

// suppress FileNode2 unused — it's referenced via envNodeTypes
void FileNode2

interface EnvVar {
  name: string
  required: boolean
  isSet: boolean
  default: string | null
  category: string
  description: string
  usedBy: string[]
}

interface EnvMapData {
  variables: EnvVar[]
  summary: {
    total: number
    set: number
    unset: number
    required: number
    byCategory: Record<string, number>
  }
}

function EnvVarNode({ data }: { data: EnvVar }) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${data.isSet ? 'green' : 'red'}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 200,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={data.required ? 'red' : 'gray'} variant="filled">
          {data.required ? 'required' : 'optional'}
        </Badge>
        <Badge size="xs" color={CATEGORY_COLORS[data.category] || 'gray'} variant="light">
          {data.category}
        </Badge>
      </Group>
      <Text size="xs" fw={700} ff="monospace">
        {data.name}
      </Text>
      <Text size="xs" c="dimmed">
        {data.description}
      </Text>
      <Group gap={6} mt={4}>
        <Badge size="xs" color={data.isSet ? 'green' : 'red'} variant="dot">
          {data.isSet ? 'set' : 'unset'}
        </Badge>
        {data.default && (
          <Text size="xs" c="dimmed">
            default: {data.default}
          </Text>
        )}
      </Group>
    </div>
  )
}

const envNodeTypes = { envVar: EnvVarNode, file: projectNodeTypes.file }

function EnvMapFlowInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'env-map'],
    queryFn: () => fetch('/api/admin/env-map', { credentials: 'include' }).then((r) => r.json()) as Promise<EnvMapData>,
  })
  const flow = useFlowAutoSave(storageKey('env-map'))

  useEffect(() => {
    if (!data?.variables) return
    const categories = ['database', 'cache', 'auth', 'app']
    const nodes: Node[] = []
    const edges: Edge[] = []
    const consumerFiles = new Set<string>()

    let colX = 0
    for (const cat of categories) {
      const vars = data.variables.filter((v) => v.category === cat)
      vars.forEach((v, i) => {
        nodes.push({
          id: `env_${v.name}`,
          type: 'envVar',
          position: flow.loadPos?.[`env_${v.name}`] ?? { x: colX, y: i * 120 },
          data: v as unknown as Record<string, unknown>,
        })
        for (const file of v.usedBy) consumerFiles.add(file)
      })
      colX += 300
    }

    const fileArr = Array.from(consumerFiles)
    fileArr.forEach((file, i) => {
      const id = `file_${file}`
      nodes.push({
        id,
        type: 'file',
        position: flow.loadPos?.[id] ?? { x: colX, y: i * 120 },
        data: { path: file, category: 'backend', lines: 0, exports: [], imports: [] },
      })
    })

    for (const v of data.variables) {
      for (const file of v.usedBy) {
        edges.push({
          id: `env_${v.name}_${file}`,
          source: `env_${v.name}`,
          target: `file_${file}`,
          style: { stroke: 'var(--mantine-color-green-4)', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
        })
      }
    }

    flow.setNodes(nodes)
    flow.setEdges(edges)
  }, [data, flow.setNodes, flow.setEdges, flow.loadPos])

  if (isLoading)
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">Loading env map...</Text>
      </Stack>
    )
  if (!data)
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">No data</Text>
      </Stack>
    )

  return (
    <>
      <Group px="md" pb="xs" gap="sm">
        <Badge size="sm" color="green" variant="light">
          Set: {data.summary.set}
        </Badge>
        <Badge size="sm" color="red" variant="light">
          Unset: {data.summary.unset}
        </Badge>
        <Badge size="sm" color="orange" variant="light">
          Required: {data.summary.required}
        </Badge>
        <Text size="xs" c="dimmed">
          Total: {data.summary.total}
        </Text>
        <LayoutSelector layoutKey={storageKey('env-map')} onLayout={flow.relayout} />
        <Tooltip label="Reload">
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'env-map'] })}
          >
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          onNodesChange={flow.handleNodesChange}
          onEdgesChange={flow.onEdgesChange}
          onMoveEnd={flow.handleMoveEnd}
          nodeTypes={envNodeTypes}
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

export function EnvMapFlow() {
  return (
    <ReactFlowProvider>
      <EnvMapFlowInner />
    </ReactFlowProvider>
  )
}
