/**
 * GanttTaskList — custom left panel untuk Gantt chart.
 * Sync scroll dengan timeline panel via ref callback dari parent.
 * Menampilkan: avatar (Google photo / inisial fallback), nama task,
 * status badge berwarna, assignee name + priority icon.
 */
import { Badge, Box, Group, Stack, Text, Tooltip } from '@mantine/core'
import { forwardRef } from 'react'
import { UserAvatar } from './shared/UserAvatar'

export type GanttTaskMeta = {
  id: string
  title: string
  kind: 'TASK' | 'BUG' | 'QC'
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  assigneeName: string | null
  assigneeImage: string | null
  isOverdue: boolean
  progress: number
}

interface Props {
  tasks: GanttTaskMeta[]
  rowHeight: number
  headerHeight: number
  width: number
  onTaskClick: (id: string) => void
  onScroll?: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<GanttTaskMeta['status'], string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'violet',
  READY_FOR_QC: 'yellow',
  REOPENED: 'orange',
  CLOSED: 'teal',
}

const STATUS_SHORT: Record<GanttTaskMeta['status'], string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'WIP',
  READY_FOR_QC: 'QC',
  REOPENED: '↩',
  CLOSED: '✓',
}

const PRIORITY_COLOR: Record<GanttTaskMeta['priority'], string> = {
  LOW: 'var(--mantine-color-gray-5)',
  MEDIUM: 'var(--mantine-color-blue-5)',
  HIGH: 'var(--mantine-color-orange-5)',
  CRITICAL: 'var(--mantine-color-red-5)',
}

const PRIORITY_LABEL: Record<GanttTaskMeta['priority'], string> = {
  LOW: '↓', MEDIUM: '→', HIGH: '↑', CRITICAL: '⚑',
}

const KIND_COLOR: Record<GanttTaskMeta['kind'], string> = {
  TASK: 'blue', BUG: 'red', QC: 'teal',
}


// ─── Component ────────────────────────────────────────────────────────────────

export const GanttTaskList = forwardRef<HTMLDivElement, Props>(
  ({ tasks, rowHeight, headerHeight, width, onTaskClick, onScroll }, ref) => {
    return (
      <Box
        style={{
          width,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--mantine-color-default-border)',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* Header */}
        <Box
          style={{
            height: headerHeight,
            flexShrink: 0,
            borderBottom: '1px solid var(--mantine-color-default-border)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '0 12px 8px',
            gap: 8,
          }}
        >
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>
            Task
          </Text>
          <Text size="xs" c="dimmed">/ Assignee</Text>
        </Box>

        {/* Scrollable body — ref syncs with timeline scroll */}
        <Box
          ref={ref}
          onScroll={onScroll}
          style={{
            flex: 1,
            overflowY: 'scroll',
            overflowX: 'hidden',
            scrollbarWidth: 'none',
          }}
        >
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              rowHeight={rowHeight}
              onClick={() => onTaskClick(task.id)}
            />
          ))}
        </Box>
      </Box>
    )
  },
)

GanttTaskList.displayName = 'GanttTaskList'

// ─── Row ──────────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  rowHeight,
  onClick,
}: {
  task: GanttTaskMeta
  rowHeight: number
  onClick: () => void
}) {
  const statusColor = task.isOverdue ? 'red' : STATUS_COLOR[task.status]
  const statusLabel = task.isOverdue ? 'Overdue' : STATUS_SHORT[task.status]

  return (
    <Box
      onClick={onClick}
      style={{
        height: rowHeight,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 8,
        borderBottom: '1px solid var(--mantine-color-default-border)',
        cursor: 'pointer',
        transition: 'background 100ms',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background =
          'var(--mantine-color-default-hover)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = ''
      }}
    >
      {/* Assignee avatar */}
      <Tooltip label={task.assigneeName ?? 'Unassigned'} withArrow position="right">
        <UserAvatar
          name={task.assigneeName}
          image={task.assigneeImage}
          size={28}
          color="blue"
          style={{ flexShrink: 0 }}
        />
      </Tooltip>

      {/* Task info */}
      <Stack gap={1} style={{ minWidth: 0, flex: 1 }}>
        {/* Title row */}
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          {task.kind !== 'TASK' && (
            <Badge
              size="xs"
              color={KIND_COLOR[task.kind]}
              variant="light"
              style={{ flexShrink: 0, fontSize: 9 }}
            >
              {task.kind}
            </Badge>
          )}
          <Text
            size="xs"
            fw={500}
            truncate
            style={{ minWidth: 0 }}
            title={task.title}
          >
            {task.title}
          </Text>
        </Group>

        {/* Meta row: status + priority + assignee */}
        <Group gap={4} wrap="nowrap">
          <Badge
            size="xs"
            color={statusColor}
            variant={task.isOverdue ? 'filled' : 'light'}
            style={{ flexShrink: 0, fontSize: 9 }}
          >
            {statusLabel}
          </Badge>
          <Text
            size="10px"
            style={{
              color: PRIORITY_COLOR[task.priority],
              flexShrink: 0,
              fontWeight: 700,
            }}
          >
            {PRIORITY_LABEL[task.priority]}
          </Text>
          {task.assigneeName && (
            <Text size="10px" c="dimmed" truncate style={{ minWidth: 0 }}>
              {task.assigneeName.split(' ')[0]}
            </Text>
          )}
          {!task.assigneeName && (
            <Text size="10px" c="dimmed">Unassigned</Text>
          )}
        </Group>
      </Stack>
    </Box>
  )
}
