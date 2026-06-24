import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  SegmentedControl,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import {
  TbAlertTriangle,
  TbCalendarOff,
  TbDownload,
  TbLock,
  TbSearch,
  TbUserQuestion,
} from 'react-icons/tb'
import type { QuickFilter } from './types'

export function SearchAndViewBar({
  search,
  onSearchChange,
  quickFilter,
  onQuickFilterChange,
  showClearAll,
  onClearAll,
  view,
  onViewChange,
  total,
  taskCount,
  status,
  onExport,
}: {
  search: string
  onSearchChange: (v: string) => void
  quickFilter: QuickFilter
  onQuickFilterChange: (v: QuickFilter) => void
  showClearAll: boolean
  onClearAll: () => void
  view: 'table' | 'gantt' | 'kanban'
  onViewChange: (v: 'table' | 'gantt' | 'kanban') => void
  total: number
  taskCount: number
  status: string | null
  onExport: () => void
}) {
  return (
    <>
      <Divider />
      <Group gap="sm" wrap="wrap" align="center">
        <TextInput
          placeholder="Cari judul atau deskripsi"
          leftSection={<TbSearch size={12} />}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          size="xs"
          w={230}
        />
        <Text size="xs" c="dimmed" fw={500}>Quick</Text>
        <Badge
          color={quickFilter === 'openOnly' ? 'blue' : 'gray'}
          variant={quickFilter === 'openOnly' ? 'filled' : 'light'}
          size="sm"
          style={{ cursor: 'pointer' }}
          onClick={() => onQuickFilterChange(quickFilter === 'openOnly' ? null : 'openOnly')}
        >
          Open only
        </Badge>
        <Divider orientation="vertical" />
        <Text size="xs" c="dimmed" fw={500}>Attention</Text>
        <Badge
          color={quickFilter === 'overdue' ? 'red' : 'gray'}
          variant={quickFilter === 'overdue' ? 'filled' : 'light'}
          size="sm"
          leftSection={<TbAlertTriangle size={10} />}
          style={{ cursor: 'pointer' }}
          onClick={() => onQuickFilterChange(quickFilter === 'overdue' ? null : 'overdue')}
        >
          Overdue
        </Badge>
        <Badge
          color={quickFilter === 'unassigned' ? 'orange' : 'gray'}
          variant={quickFilter === 'unassigned' ? 'filled' : 'light'}
          size="sm"
          leftSection={<TbUserQuestion size={10} />}
          style={{ cursor: 'pointer' }}
          onClick={() => onQuickFilterChange(quickFilter === 'unassigned' ? null : 'unassigned')}
        >
          Unassigned
        </Badge>
        <Badge
          color={quickFilter === 'blocked' ? 'gray' : 'gray'}
          variant={quickFilter === 'blocked' ? 'filled' : 'light'}
          size="sm"
          leftSection={<TbLock size={10} />}
          style={{ cursor: 'pointer' }}
          onClick={() => onQuickFilterChange(quickFilter === 'blocked' ? null : 'blocked')}
        >
          Blocked
        </Badge>
        <Badge
          color={quickFilter === 'nodue' ? 'gray' : 'gray'}
          variant={quickFilter === 'nodue' ? 'filled' : 'light'}
          size="sm"
          leftSection={<TbCalendarOff size={10} />}
          style={{ cursor: 'pointer' }}
          onClick={() => onQuickFilterChange(quickFilter === 'nodue' ? null : 'nodue')}
        >
          No due date
        </Badge>
        {showClearAll && (
          <Button variant="subtle" color="gray" size="compact-xs" onClick={onClearAll}>
            Clear all
          </Button>
        )}
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => onViewChange(v as 'table' | 'gantt' | 'kanban')}
          data={[
            { value: 'table', label: 'Table' },
            { value: 'kanban', label: 'Kanban' },
            { value: 'gantt', label: 'Gantt' },
          ]}
          ml="auto"
        />
        <Tooltip
          label={`Download CSV (${total > 0 ? `${total} task` : 'kosong'}${status ? ` · ${status}` : ' · semua status'} · halaman ini)`}
          withArrow
        >
          <ActionIcon variant="light" color="teal" size="sm" onClick={onExport} disabled={taskCount === 0}>
            <TbDownload size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </>
  )
}
