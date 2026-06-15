import { ActionIcon, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, type Edge, MarkerType, type Node, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect, useState } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { projectNodeTypes } from '@/frontend/components/dev/flow-nodes'
import { LayoutSelector, storageKey, useFlowAutoSave } from '@/frontend/components/dev/flow-layout'

export interface FileInfo {
  path: string
  category: string
  lines: number
  exports: string[]
  imports: { from: string; names: string[] }[]
}

export interface ProjectData {
  files: FileInfo[]
  directories: { path: string; category: string; fileCount: number }[]
  summary: {
    totalFiles: number
    totalLines: number
    totalExports: number
    totalImports: number
    byCategory: Record<string, number>
  }
}

function FileStructureFlowInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'project-structure'],
    queryFn: () =>
      fetch('/api/admin/project-structure', { credentials: 'include' }).then((r) => r.json()) as Promise<ProjectData>,
  })
  const [filter, setFilter] = useState('all')
  const flow = useFlowAutoSave(storageKey('file-structure'))

  useEffect(() => {
    if (!data?.files) return
    const filtered =
      filter === 'all'
        ? data.files
        : data.files.filter(
            (f) =>
              f.category === filter ||
              (filter === 'frontend' && ['route', 'hook', 'component', 'frontend'].includes(f.category)) ||
              (filter === 'test' && f.category.startsWith('test')),
          )
    const fileSet = new Set(filtered.map((f) => f.path))
    const nodes: Node[] = []
    const edges: Edge[] = []
    const cols = Math.max(3, Math.ceil(Math.sqrt(filtered.length)))

    filtered.forEach((f, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const defaultPos = { x: col * 280, y: row * 120 }
      nodes.push({
        id: f.path,
        type: 'file',
        position: flow.loadPos?.[f.path] ?? defaultPos,
        data: f as unknown as Record<string, unknown>,
      })
    })

    for (const f of filtered) {
      for (const imp of f.imports) {
        if (fileSet.has(imp.from)) {
          edges.push({
            id: `imp_${f.path}_${imp.from}`,
            source: f.path,
            target: imp.from,
            label: imp.names.length <= 2 ? imp.names.join(', ') : `${imp.names.length} imports`,
            labelStyle: { fontSize: 8, fontFamily: 'monospace' },
            style: { stroke: 'var(--mantine-color-violet-4)', strokeWidth: 1 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
          })
        }
      }
    }

    flow.setNodes(nodes)
    flow.setEdges(edges)
  }, [data, filter, flow.loadPos, flow.setNodes, flow.setEdges])

  if (isLoading)
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">Loading project...</Text>
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
            { label: `All (${data.summary.totalFiles})`, value: 'all' },
            { label: 'Frontend', value: 'frontend' },
            { label: 'Backend', value: 'backend' },
            { label: 'Lib', value: 'lib' },
            { label: 'Tests', value: 'test' },
          ]}
        />
        <Text size="xs" c="dimmed">
          {data.summary.totalLines} lines | {data.summary.totalExports} exports | {data.summary.totalImports} imports
        </Text>
        <LayoutSelector layoutKey={storageKey('file-structure')} onLayout={flow.relayout} />
        <Tooltip label="Reload files">
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'project-structure'] })}
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
          nodeTypes={projectNodeTypes}
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

export function FileStructureFlow() {
  return (
    <ReactFlowProvider>
      <FileStructureFlowInner />
    </ReactFlowProvider>
  )
}
