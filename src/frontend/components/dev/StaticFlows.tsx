import { Badge, Group } from '@mantine/core'
import { Background, Controls, MarkerType, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { projectNodeTypes } from '@/frontend/components/dev/flow-nodes'
import { LayoutSelector, storageKey, useFlowAutoSave } from '@/frontend/components/dev/flow-layout'

// ─── User Flow View ───────────────────────────

function UserFlowViewInner() {
  const flow = useFlowAutoSave(storageKey('user-flow'))

  useEffect(() => {
    const p = flow.loadPos
    const n = (
      id: string,
      x: number,
      y: number,
      label: string,
      opts?: Partial<{ description: string; color: string; type: string }>,
    ) => ({
      id,
      type: 'flow' as const,
      position: p?.[id] ?? { x, y },
      data: { label, ...opts },
    })
    const e = (from: string, to: string, label: string, color = 'blue', sourceHandle?: string) => ({
      id: `e_${from}_${to}_${label}`,
      source: from,
      target: to,
      sourceHandle,
      label,
      labelStyle: { fontSize: 9, fontFamily: 'monospace' } as const,
      style: { stroke: `var(--mantine-color-${color}-4)`, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed as const, width: 12, height: 12 },
      animated: true,
    })

    flow.setNodes([
      n('visit', 300, 0, 'User visits app', { color: 'gray' }),
      n('landing', 300, 80, '/ Landing Page', { color: 'cyan', description: 'Public' }),
      n('login', 300, 170, '/login', { color: 'cyan', description: 'Email + Google OAuth' }),
      n('auth-check', 300, 270, 'Authenticated?', { color: 'yellow', type: 'decision' }),
      n('blocked-check', 300, 370, 'Blocked?', { color: 'orange', type: 'decision' }),
      n('role-check', 300, 470, 'Role Check', { color: 'red', type: 'decision' }),
      n('dev', 100, 580, '/dev', { color: 'red', description: 'SUPER_ADMIN' }),
      n('admin', 300, 580, '/admin', { color: 'orange', description: 'ADMIN+' }),
      n('pm', 500, 580, '/pm', { color: 'blue', description: 'All users' }),
      n('blocked', 550, 370, '/blocked', { color: 'red', description: 'Logout only' }),
      n('logout', 550, 270, 'POST /api/auth/logout', { color: 'gray' }),
    ])
    flow.setEdges([
      e('visit', 'landing', 'open'),
      e('landing', 'login', 'go to login'),
      e('login', 'auth-check', 'submit'),
      e('auth-check', 'login', 'no → stay', 'gray', 'left'),
      e('auth-check', 'blocked-check', 'yes'),
      e('blocked-check', 'blocked', 'yes → blocked', 'red', 'right'),
      e('blocked-check', 'role-check', 'no'),
      e('role-check', 'dev', 'SUPER_ADMIN', 'red', 'left'),
      e('role-check', 'admin', 'ADMIN', 'orange'),
      e('role-check', 'pm', 'USER / QC', 'blue', 'right'),
      e('dev', 'dashboard', 'can access', 'gray'),
      e('dashboard', 'profile', 'can access', 'gray'),
      e('blocked', 'logout', 'logout only', 'gray'),
      e('logout', 'login', 'redirect', 'gray'),
    ])
  }, [flow.loadPos, flow.setEdges, flow.setNodes])

  return (
    <>
      <Group px="md" pb="xs" gap="sm">
        <Badge size="sm" color="red" variant="light">SUPER_ADMIN → /dev</Badge>
        <Badge size="sm" color="orange" variant="light">ADMIN → /admin</Badge>
        <Badge size="sm" color="blue" variant="light">USER / QC → /pm</Badge>
        <Badge size="sm" color="gray" variant="light">Blocked → /blocked</Badge>
        <LayoutSelector layoutKey={storageKey('user-flow')} onLayout={flow.relayout} />
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

export function UserFlowView() {
  return (
    <ReactFlowProvider>
      <UserFlowViewInner />
    </ReactFlowProvider>
  )
}

// ─── Data Flow View ───────────────────────────

function DataFlowViewInner() {
  const flow = useFlowAutoSave(storageKey('data-flow'))

  useEffect(() => {
    const p = flow.loadPos
    const n = (
      id: string,
      x: number,
      y: number,
      label: string,
      opts?: Partial<{ description: string; color: string; type: string }>,
    ) => ({
      id,
      type: 'flow' as const,
      position: p?.[id] ?? { x, y },
      data: { label, ...opts },
    })
    const e = (from: string, to: string, label: string, color = 'blue', sourceHandle?: string) => ({
      id: `e_${from}_${to}_${label}`,
      source: from,
      target: to,
      sourceHandle,
      label,
      labelStyle: { fontSize: 9, fontFamily: 'monospace' } as const,
      style: { stroke: `var(--mantine-color-${color}-4)`, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed as const, width: 12, height: 12 },
      animated: true,
    })

    flow.setNodes([
      n('client', 250, 0, 'Client Browser', { color: 'cyan', description: 'HTTP Request' }),
      n('elysia', 250, 100, 'Elysia Server', { color: 'green', description: 'Route matching' }),
      n('log-hook', 500, 100, 'onAfterResponse', { color: 'gray', description: 'Request logging' }),
      n('app-log', 700, 100, 'App Log (Redis)', { color: 'red', description: 'Ring buffer, max 500' }),
      n('auth-mw', 250, 200, 'Auth Check', { color: 'yellow', type: 'decision', description: 'Session cookie → DB lookup' }),
      n('401', 500, 200, '401 Unauthorized', { color: 'red' }),
      n('role-guard', 250, 310, 'Role Guard', { color: 'orange', type: 'decision', description: 'SUPER_ADMIN / ADMIN / USER' }),
      n('403', 500, 310, '403 Forbidden', { color: 'red' }),
      n('handler', 250, 420, 'Route Handler', { color: 'green', description: 'Business logic' }),
      n('prisma', 100, 530, 'Prisma (PostgreSQL)', { color: 'orange', description: 'User, Session, AuditLog' }),
      n('redis', 400, 530, 'Redis', { color: 'red', description: 'App logs, cache' }),
      n('response', 250, 640, 'JSON Response', { color: 'cyan' }),
      n('ws-client', 700, 300, 'WS Client', { color: 'violet', description: 'ws://host/ws/presence' }),
      n('ws-auth', 700, 400, 'Cookie Auth', { color: 'yellow', type: 'decision' }),
      n('presence', 700, 500, 'Presence Tracker', { color: 'violet', description: 'In-memory Map' }),
      n('broadcast', 700, 600, 'Broadcast', { color: 'violet', description: 'Online users → admin subs' }),
      n('audit-event', 100, 640, 'Audit Event', { color: 'orange', description: 'LOGIN, LOGOUT, ROLE_CHANGED...' }),
      n('audit-db', 100, 740, 'AuditLog (DB)', { color: 'orange', description: 'Auto-rotate > 90 days' }),
    ])

    flow.setEdges([
      e('client', 'elysia', 'request', 'cyan'),
      e('elysia', 'log-hook', 'after', 'gray', 'right'),
      e('log-hook', 'app-log', 'LPUSH + LTRIM', 'red'),
      e('elysia', 'auth-mw', 'route matched'),
      e('auth-mw', '401', 'no session', 'red', 'right'),
      e('auth-mw', 'role-guard', 'valid session'),
      e('role-guard', '403', 'insufficient', 'red', 'right'),
      e('role-guard', 'handler', 'authorized'),
      e('handler', 'prisma', 'query', 'orange', 'left'),
      e('handler', 'redis', 'cache/log', 'red', 'right'),
      e('prisma', 'response', 'data', 'orange'),
      e('redis', 'response', 'data', 'red'),
      e('response', 'client', 'JSON', 'cyan'),
      e('ws-client', 'ws-auth', 'connect', 'violet'),
      e('ws-auth', 'presence', 'authenticated', 'violet'),
      e('presence', 'broadcast', 'on change', 'violet'),
      e('handler', 'audit-event', 'auth events', 'orange', 'left'),
      e('audit-event', 'audit-db', 'INSERT', 'orange'),
    ])
  }, [flow.setEdges, flow.loadPos, flow.setNodes])

  return (
    <>
      <Group px="md" pb="xs" gap="sm">
        <Badge size="sm" color="cyan" variant="light">Client</Badge>
        <Badge size="sm" color="green" variant="light">Server</Badge>
        <Badge size="sm" color="yellow" variant="light">Auth</Badge>
        <Badge size="sm" color="orange" variant="light">Database</Badge>
        <Badge size="sm" color="red" variant="light">Redis</Badge>
        <Badge size="sm" color="violet" variant="light">WebSocket</Badge>
        <LayoutSelector layoutKey={storageKey('data-flow')} onLayout={flow.relayout} />
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

export function DataFlowView() {
  return (
    <ReactFlowProvider>
      <DataFlowViewInner />
    </ReactFlowProvider>
  )
}
