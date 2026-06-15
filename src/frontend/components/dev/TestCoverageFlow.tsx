import { ActionIcon, Badge, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, Handle, MarkerType, type Node, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect, useState } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { openInEditor } from '@/frontend/components/dev/flow-nodes'
import { LayoutSelector, storageKey, useFlowAutoSave } from '@/frontend/components/dev/flow-layout'

interface TestCoverageData {
  sourceFiles: { path: string; lines: number; exports: string[]; testedBy: string[]; coverage: string }[]
  testFiles: { path: string; lines: number; type: string; targets: string[] }[]
  summary: {
    totalSource: number
    totalTests: number
    covered: number
    partial: number
    uncovered: number
    coveragePercent: number
  }
}

const COVERAGE_COLORS: Record<string, string> = { covered: 'green', partial: 'yellow', uncovered: 'red' }

function SourceNode({
  data,
}: {
  data: { path: string; lines: number; exports: string[]; coverage: string; testedBy: string[] }
}) {
  const name = data.path.split('/').pop() || data.path
  return (
    <button
      type="button"
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${COVERAGE_COLORS[data.coverage] || 'gray'}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 180,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      }}
      onDoubleClick={() => openInEditor(data.path)}
      title="Double-click to open in editor"
    >
      <Handle type="target" position={Position.Right} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Handle type="source" position={Position.Left} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={COVERAGE_COLORS[data.coverage] || 'gray'} variant="filled">
          {data.coverage}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {name}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" ff="monospace">
        {data.path}
      </Text>
      <Group gap={8} mt={4}>
        <Text size="xs" c="dimmed">
          {data.lines} lines
        </Text>
        <Badge size="xs" variant="light" color="green">
          {data.exports.length} exports
        </Badge>
      </Group>
    </button>
  )
}

function TestNodeComp({ data }: { data: { path: string; lines: number; type: string } }) {
  const name = data.path.split('/').pop() || data.path
  const typeColor = data.type === 'unit' ? 'blue' : data.type === 'integration' ? 'green' : 'violet'
  return (
    <button
      type="button"
      style={{
        padding: 8,
        borderRadius: 8,
        border: `1px solid var(--mantine-color-${typeColor}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 180,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      }}
      onDoubleClick={() => openInEditor(data.path)}
      title="Double-click to open in editor"
    >
      <Handle type="target" position={Position.Left} style={{ background: `var(--mantine-color-${typeColor}-6)` }} />
      <Handle type="source" position={Position.Right} style={{ background: `var(--mantine-color-${typeColor}-6)` }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={typeColor} variant="filled">
          {data.type}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {name}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {data.lines} lines
      </Text>
    </button>
  )
}

const testNodeTypes = { source: SourceNode, test: TestNodeComp }

function TestCoverageFlowInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'test-coverage'],
    queryFn: () =>
      fetch('/api/admin/test-coverage', { credentials: 'include' }).then((r) => r.json()) as Promise<TestCoverageData>,
  })
  const [filter, setFilter] = useState('all')
  const flow = useFlowAutoSave(storageKey('test-coverage'))

  useEffect(() => {
    if (!data?.sourceFiles) return
    const filtered = filter === 'all' ? data.sourceFiles : data.sourceFiles.filter((f) => f.coverage === filter)
    const nodes: Node[] = []
    const edges: any[] = []

    filtered.forEach((f, i) => {
      nodes.push({ id: f.path, type: 'source', position: flow.loadPos?.[f.path] ?? { x: 0, y: i * 100 }, data: f })
    })

    const testSet = new Set<string>()
    for (const f of filtered) for (const t of f.testedBy) testSet.add(t)
    const tests = data.testFiles.filter((t) => testSet.has(t.path))
    tests.forEach((t, i) => {
      nodes.push({ id: t.path, type: 'test', position: flow.loadPos?.[t.path] ?? { x: 500, y: i * 100 }, data: t })
    })

    for (const t of tests) {
      for (const target of t.targets) {
        if (filtered.some((f) => f.path === target)) {
          edges.push({
            id: `test_${t.path}_${target}`,
            source: t.path,
            target,
            style: { stroke: 'var(--mantine-color-green-4)', strokeWidth: 1 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
            animated: true,
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
        <Text c="dimmed">Loading coverage...</Text>
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
            { label: `All (${data.summary.totalSource})`, value: 'all' },
            { label: `Covered (${data.summary.covered})`, value: 'covered' },
            { label: `Partial (${data.summary.partial})`, value: 'partial' },
            { label: `Uncovered (${data.summary.uncovered})`, value: 'uncovered' },
          ]}
        />
        <Badge
          size="sm"
          color={data.summary.coveragePercent >= 70 ? 'green' : data.summary.coveragePercent >= 40 ? 'yellow' : 'red'}
          variant="light"
        >
          {data.summary.coveragePercent}% coverage
        </Badge>
        <Text size="xs" c="dimmed">
          {data.summary.totalTests} test files
        </Text>
        <LayoutSelector layoutKey={storageKey('test-coverage')} onLayout={flow.relayout} />
        <Tooltip label="Reload">
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'test-coverage'] })}
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
          nodeTypes={testNodeTypes}
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

export function TestCoverageFlow() {
  return (
    <ReactFlowProvider>
      <TestCoverageFlowInner />
    </ReactFlowProvider>
  )
}
