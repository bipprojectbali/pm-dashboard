import { ActionIcon, Badge, Group, Stack, Text, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, Handle, MarkerType, type Node, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { LayoutSelector, storageKey, useFlowAutoSave } from '@/frontend/components/dev/flow-layout'

interface SessionData {
  sessions: {
    id: string
    userId: string
    userName: string
    userEmail: string
    userRole: string
    userBlocked: boolean
    isOnline: boolean
    createdAt: string
    expiresAt: string
    isExpired: boolean
  }[]
  summary: {
    totalSessions: number
    activeSessions: number
    expiredSessions: number
    onlineUsers: number
    byRole: Record<string, number>
  }
}

function SessionUserNode({
  data,
}: {
  data: {
    userName: string
    userEmail: string
    userRole: string
    userBlocked: boolean
    isOnline: boolean
    sessionCount: number
    isExpired: boolean
  }
}) {
  const roleColor = data.userRole === 'SUPER_ADMIN' ? 'red' : data.userRole === 'ADMIN' ? 'orange' : 'blue'
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${data.userBlocked ? 'red' : roleColor}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 180,
      }}
    >
      <Handle type="source" position={Position.Right} style={{ background: `var(--mantine-color-${roleColor}-6)` }} />
      <Group gap={6} mb={4}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: `var(--mantine-color-${data.isOnline ? 'green' : 'gray'}-6)`,
          }}
        />
        <Text size="xs" fw={700}>
          {data.userName}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {data.userEmail}
      </Text>
      <Group gap={4} mt={4}>
        <Badge size="xs" color={roleColor} variant="filled">
          {data.userRole}
        </Badge>
        {data.userBlocked && (
          <Badge size="xs" color="red" variant="filled">
            BLOCKED
          </Badge>
        )}
        <Badge size="xs" variant="light">
          {data.sessionCount} sessions
        </Badge>
      </Group>
    </div>
  )
}

function RoleAccessNode({ data }: { data: { label: string; routes: string[]; color: string; count: number } }) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${data.color}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 150,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: `var(--mantine-color-${data.color}-6)` }} />
      <Handle type="source" position={Position.Right} style={{ background: `var(--mantine-color-${data.color}-6)` }} />
      <Text size="xs" fw={700}>
        {data.label}
      </Text>
      <Badge size="xs" variant="light" color={data.color} mt={4}>
        {data.count} users
      </Badge>
      <Stack gap={2} mt={4}>
        {data.routes.map((r) => (
          <Text key={r} size="xs" c="dimmed" ff="monospace">
            {r}
          </Text>
        ))}
      </Stack>
    </div>
  )
}

const sessionNodeTypes = { sessionUser: SessionUserNode, roleAccess: RoleAccessNode }

function SessionsFlowInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () =>
      fetch('/api/admin/sessions', { credentials: 'include' }).then((r) => r.json()) as Promise<SessionData>,
    refetchInterval: 10000,
  })
  const flow = useFlowAutoSave(storageKey('sessions'))

  useEffect(() => {
    if (!data?.sessions) return
    const nodes: Node[] = []
    const edges: any[] = []

    const userMap = new Map<string, typeof data.sessions>()
    for (const s of data.sessions) {
      if (!userMap.has(s.userId)) userMap.set(s.userId, [])
      userMap.get(s.userId)!.push(s)
    }

    let userY = 0
    for (const [userId, sessions] of userMap) {
      const first = sessions[0]
      const id = `user_${userId}`
      nodes.push({
        id,
        type: 'sessionUser',
        position: flow.loadPos?.[id] ?? { x: 0, y: userY },
        data: { ...first, sessionCount: sessions.length, isExpired: sessions.every((s) => s.isExpired) },
      })
      userY += 100
    }

    const roles: { role: string; color: string; routes: string[] }[] = [
      { role: 'SUPER_ADMIN', color: 'red', routes: ['/dev', '/admin', '/pm', '/settings'] },
      { role: 'ADMIN', color: 'orange', routes: ['/admin', '/pm', '/settings'] },
      { role: 'QC', color: 'teal', routes: ['/pm', '/settings'] },
      { role: 'USER', color: 'blue', routes: ['/pm', '/settings'] },
    ]

    roles.forEach((r, i) => {
      const id = `role_${r.role}`
      nodes.push({
        id,
        type: 'roleAccess',
        position: flow.loadPos?.[id] ?? { x: 350, y: i * 150 },
        data: { label: r.role, routes: r.routes, color: r.color, count: data.summary.byRole[r.role] || 0 },
      })
    })

    for (const [userId, sessions] of userMap) {
      const role = sessions[0].userRole
      edges.push({
        id: `sess_${userId}_${role}`,
        source: `user_${userId}`,
        target: `role_${role}`,
        style: {
          stroke: `var(--mantine-color-${role === 'SUPER_ADMIN' ? 'red' : role === 'ADMIN' ? 'orange' : 'blue'}-4)`,
          strokeWidth: 1.5,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
        animated: sessions.some((s) => s.isOnline),
      })
    }

    flow.setNodes(nodes)
    flow.setEdges(edges)
  }, [data, flow.setNodes, flow.setEdges, flow.loadPos])

  if (isLoading)
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">Loading sessions...</Text>
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
          Active: {data.summary.activeSessions}
        </Badge>
        <Badge size="sm" color="gray" variant="light">
          Expired: {data.summary.expiredSessions}
        </Badge>
        <Badge size="sm" color="teal" variant="light">
          Online: {data.summary.onlineUsers}
        </Badge>
        <Text size="xs" c="dimmed">
          Auto-refresh 10s
        </Text>
        <LayoutSelector layoutKey={storageKey('sessions')} onLayout={flow.relayout} />
        <Tooltip label="Reload">
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'sessions'] })}
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
          nodeTypes={sessionNodeTypes}
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

export function SessionsFlow() {
  return (
    <ReactFlowProvider>
      <SessionsFlowInner />
    </ReactFlowProvider>
  )
}
