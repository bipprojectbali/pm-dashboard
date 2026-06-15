import { Badge, Group, Text } from '@mantine/core'
import { Handle, Position } from '@xyflow/react'

export const METHOD_COLORS: Record<string, string> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'orange',
  DELETE: 'red',
  WS: 'violet',
  PAGE: 'cyan',
}

export const AUTH_COLORS: Record<string, string> = {
  public: 'gray',
  authenticated: 'yellow',
  admin: 'orange',
  superAdmin: 'red',
}

export const CATEGORY_COLORS: Record<string, string> = {
  frontend: 'blue',
  route: 'blue',
  auth: 'cyan',
  admin: 'red',
  utility: 'gray',
  realtime: 'violet',
  backend: 'green',
  lib: 'violet',
  hook: 'teal',
  component: 'indigo',
  prisma: 'orange',
  'test-unit': 'yellow',
  'test-integration': 'yellow',
  test: 'yellow',
  config: 'gray',
}

export function openInEditor(relativePath: string) {
  fetch('/__open-in-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relativePath, lineNumber: '1', columnNumber: '1' }),
  }).catch(() => {})
}

export function RouteNode({
  data,
}: {
  data: { method: string; path: string; auth: string; category: string; description: string }
}) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-body)',
        minWidth: 220,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={METHOD_COLORS[data.method] || 'gray'} variant="filled">
          {data.method}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {data.path}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" lineClamp={1}>
        {data.description}
      </Text>
      <Group gap={4} mt={4}>
        <Badge size="xs" variant="dot" color={AUTH_COLORS[data.auth] || 'gray'}>
          {data.auth}
        </Badge>
        <Badge size="xs" variant="light" color={CATEGORY_COLORS[data.category] || 'gray'}>
          {data.category}
        </Badge>
      </Group>
    </div>
  )
}

export function FileNode2({
  data,
}: {
  data: {
    path: string
    category: string
    lines: number
    exports: string[]
    imports: { from: string; names: string[] }[]
  }
}) {
  const name = data.path.split('/').pop() || data.path
  return (
    <button
      type="button"
      style={{
        padding: 8,
        borderRadius: 8,
        border: '1px solid var(--mantine-color-default-border)',
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
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-violet-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-violet-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={CATEGORY_COLORS[data.category] || 'gray'} variant="filled">
          {data.category}
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
        {data.exports.length > 0 && (
          <Badge size="xs" variant="light" color="green">
            {data.exports.length} exports
          </Badge>
        )}
        {data.imports.length > 0 && (
          <Badge size="xs" variant="light" color="blue">
            {data.imports.length} imports
          </Badge>
        )}
      </Group>
    </button>
  )
}

export function FlowNode({ data }: { data: { label: string; description?: string; color?: string; type?: string } }) {
  const isDiamond = data.type === 'decision'
  return (
    <div
      style={{
        padding: isDiamond ? 12 : 8,
        borderRadius: isDiamond ? 4 : 8,
        border: `2px solid var(--mantine-color-${data.color || 'blue'}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: isDiamond ? 120 : 160,
        transform: isDiamond ? 'rotate(0deg)' : undefined,
        textAlign: 'center',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: `var(--mantine-color-${data.color || 'blue'}-6)` }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: `var(--mantine-color-${data.color || 'blue'}-6)` }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: `var(--mantine-color-${data.color || 'blue'}-6)` }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        style={{ background: `var(--mantine-color-${data.color || 'blue'}-6)` }}
      />
      <Text size="xs" fw={700}>
        {data.label}
      </Text>
      {data.description && (
        <Text size="xs" c="dimmed">
          {data.description}
        </Text>
      )}
    </div>
  )
}

export const projectNodeTypes = { route: RouteNode, file: FileNode2, flow: FlowNode }
