import { ActionIcon, Badge, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, Handle, MarkerType, type Node, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect, useState } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { CATEGORY_COLORS, projectNodeTypes } from '@/frontend/components/dev/flow-nodes'
import { LayoutSelector, storageKey, useFlowAutoSave } from '@/frontend/components/dev/flow-layout'

interface DepData {
  packages: { name: string; version: string; type: string; category: string; usedBy: string[] }[]
  summary: { total: number; runtime: number; dev: number; byCategory: Record<string, number> }
}

function PackageNode({
  data,
}: {
  data: { name: string; version: string; type: string; category: string; usedBy: string[] }
}) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `1px solid var(--mantine-color-${data.type === 'runtime' ? 'green' : 'orange'}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 180,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={data.type === 'runtime' ? 'green' : 'orange'} variant="filled">
          {data.type}
        </Badge>
        <Badge size="xs" color={CATEGORY_COLORS[data.category] || 'gray'} variant="light">
          {data.category}
        </Badge>
      </Group>
      <Text size="xs" fw={700} ff="monospace">
        {data.name}
      </Text>
      <Text size="xs" c="dimmed">
        {data.version}
      </Text>
      {data.usedBy.length > 0 && (
        <Badge size="xs" variant="light" mt={4}>
          {data.usedBy.length} files
        </Badge>
      )}
    </div>
  )
}

const depNodeTypes = { package: PackageNode, file: projectNodeTypes.file }

function DependenciesFlowInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'dependencies'],
    queryFn: () =>
      fetch('/api/admin/dependencies', { credentials: 'include' }).then((r) => r.json()) as Promise<DepData>,
  })
  const [filter, setFilter] = useState('all')
  const flow = useFlowAutoSave(storageKey('dependencies'))

  useEffect(() => {
    if (!data?.packages) return
    const filtered = filter === 'all' ? data.packages : data.packages.filter((p) => p.type === filter)
    const nodes: Node[] = []
    const edges: any[] = []
    const categories = [...new Set(filtered.map((p) => p.category))]
    let colX = 0

    for (const cat of categories) {
      const pkgs = filtered.filter((p) => p.category === cat)
      pkgs.forEach((p, i) => {
        const id = `pkg_${p.name}`
        nodes.push({ id, type: 'package', position: flow.loadPos?.[id] ?? { x: colX, y: i * 110 }, data: p })
      })
      colX += 280
    }

    const consumerFiles = new Set<string>()
    for (const p of filtered) for (const f of p.usedBy) consumerFiles.add(f)
    const files = Array.from(consumerFiles)
    files.forEach((f, i) => {
      const id = `file_${f}`
      nodes.push({
        id,
        type: 'file',
        position: flow.loadPos?.[id] ?? { x: colX, y: i * 110 },
        data: { path: f, category: 'backend', lines: 0, exports: [], imports: [] },
      })
    })

    for (const p of filtered) {
      for (const f of p.usedBy) {
        edges.push({
          id: `dep_${p.name}_${f}`,
          source: `pkg_${p.name}`,
          target: `file_${f}`,
          style: { stroke: 'var(--mantine-color-blue-4)', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
        })
      }
    }

    flow.setNodes(nodes)
    flow.setEdges(edges)
  }, [data, filter, flow.setEdges, flow.loadPos, flow.setNodes])

  if (isLoading)
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">Loading dependencies...</Text>
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
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          data={[
            { label: `All (${data.summary.total})`, value: 'all' },
            { label: `Runtime (${data.summary.runtime})`, value: 'runtime' },
            { label: `Dev (${data.summary.dev})`, value: 'dev' },
          ]}
        />
        {Object.entries(data.summary.byCategory).map(([c, n]) => (
          <Badge key={c} size="sm" variant="light" color={CATEGORY_COLORS[c] || 'gray'}>
            {c}: {n}
          </Badge>
        ))}
        <LayoutSelector layoutKey={storageKey('dependencies')} onLayout={flow.relayout} />
        <Tooltip label="Reload">
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'dependencies'] })}
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
          nodeTypes={depNodeTypes}
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

export function DependenciesFlow() {
  return (
    <ReactFlowProvider>
      <DependenciesFlowInner />
    </ReactFlowProvider>
  )
}
