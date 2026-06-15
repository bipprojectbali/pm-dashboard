import { ActionIcon, Badge, Group, Stack, Text, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, Handle, MarkerType, type Node, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect, useState } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { LayoutSelector, storageKey, useFlowAutoSave } from '@/frontend/components/dev/flow-layout'

interface MigrationData {
  migrations: { name: string; folder: string; createdAt: string; changes: string[]; sql: string }[]
  summary: {
    totalMigrations: number
    firstMigration: string | null
    lastMigration: string | null
    totalChanges: number
  }
}

function MigrationNode({ data }: { data: { name: string; createdAt: string; changes: string[]; sql: string } }) {
  const [showSql, setShowSql] = useState(false)
  const date = new Date(data.createdAt).toLocaleDateString()
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 8,
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-body)',
        minWidth: 220,
        maxWidth: 260,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-orange-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-orange-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color="orange" variant="filled">
          {date}
        </Badge>
      </Group>
      <Text size="xs" fw={700} ff="monospace" lineClamp={1}>
        {data.name}
      </Text>
      <Stack gap={2} mt={4}>
        {data.changes.map((c) => {
          const color = c.startsWith('CREATE')
            ? 'green'
            : c.startsWith('ALTER')
              ? 'yellow'
              : c.startsWith('DROP')
                ? 'red'
                : 'gray'
          return (
            <Badge key={c} size="xs" variant="light" color={color} ff="monospace">
              {c}
            </Badge>
          )
        })}
      </Stack>
      {data.sql && (
        <Text size="xs" c="blue" mt={4} style={{ cursor: 'pointer' }} onClick={() => setShowSql(!showSql)}>
          {showSql ? 'Hide SQL' : 'Show SQL'}
        </Text>
      )}
      {showSql && (
        <Text
          size="xs"
          ff="monospace"
          c="dimmed"
          mt={4}
          style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}
        >
          {data.sql}
        </Text>
      )}
    </div>
  )
}

const migrationNodeTypes = { migration: MigrationNode }

function MigrationsFlowInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'migrations'],
    queryFn: () =>
      fetch('/api/admin/migrations', { credentials: 'include' }).then((r) => r.json()) as Promise<MigrationData>,
  })
  const flow = useFlowAutoSave(storageKey('migrations'))

  useEffect(() => {
    if (!data?.migrations) return
    const nodes: Node[] = []
    const edges: any[] = []

    data.migrations.forEach((m, i) => {
      const id = `mig_${m.folder}`
      nodes.push({ id, type: 'migration', position: flow.loadPos?.[id] ?? { x: i * 320, y: 0 }, data: m })
      if (i > 0) {
        const prevId = `mig_${data.migrations[i - 1].folder}`
        edges.push({
          id: `mig_e_${i}`,
          source: prevId,
          target: id,
          label: `#${i + 1}`,
          labelStyle: { fontSize: 9 },
          style: { stroke: 'var(--mantine-color-orange-4)', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
          animated: true,
        })
      }
    })

    flow.setNodes(nodes)
    flow.setEdges(edges)
  }, [data, flow.loadPos, flow.setNodes, flow.setEdges])

  if (isLoading)
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">Loading migrations...</Text>
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
        <Badge size="sm" color="orange" variant="light">
          {data.summary.totalMigrations} migrations
        </Badge>
        <Badge size="sm" variant="light">
          {data.summary.totalChanges} changes
        </Badge>
        {data.summary.firstMigration && (
          <Text size="xs" c="dimmed">
            From {new Date(data.summary.firstMigration).toLocaleDateString()} →{' '}
            {new Date(data.summary.lastMigration!).toLocaleDateString()}
          </Text>
        )}
        <LayoutSelector layoutKey={storageKey('migrations')} onLayout={flow.relayout} />
        <Tooltip label="Reload">
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'migrations'] })}
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
          nodeTypes={migrationNodeTypes}
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

export function MigrationsFlow() {
  return (
    <ReactFlowProvider>
      <MigrationsFlowInner />
    </ReactFlowProvider>
  )
}
