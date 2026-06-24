import { Badge, Card, Group, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import { TbSearch } from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { STALE_DAYS, type QuickFilter } from './types'

type Props = {
  search: string
  onSearchChange: (v: string) => void
  projectFilter: string | null
  onProjectFilterChange: (v: string | null) => void
  projectOptions: { value: string; label: string }[]
  statusFilter: string | null
  onStatusFilterChange: (v: string | null) => void
  priorityFilter: string | null
  onPriorityFilterChange: (v: string | null) => void
  assigneeFilter: string | null
  onAssigneeFilterChange: (v: string | null) => void
  assigneeOptions: { value: string; label: string }[]
  quick: QuickFilter
  onQuickChange: (v: QuickFilter) => void
  filteredCount: number
  totalCount: number
  hasFilters: boolean
  onClearFilters: () => void
}

export function TriageFilters({
  search, onSearchChange,
  projectFilter, onProjectFilterChange, projectOptions,
  statusFilter, onStatusFilterChange,
  priorityFilter, onPriorityFilterChange,
  assigneeFilter, onAssigneeFilterChange, assigneeOptions,
  quick, onQuickChange,
  filteredCount, totalCount,
  hasFilters, onClearFilters,
}: Props) {
  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Cari judul, project, atau assignee"
            leftSection={<TbSearch size={12} />}
            value={search}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            size="xs"
            w={280}
          />
          <Select
            placeholder="All projects"
            data={projectOptions}
            value={projectFilter}
            onChange={onProjectFilterChange}
            clearable
            searchable
            size="xs"
            w={200}
          />
          <Select
            placeholder="All statuses"
            data={['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED']}
            value={statusFilter}
            onChange={onStatusFilterChange}
            clearable
            size="xs"
            w={160}
          />
          <Select
            placeholder="All priorities"
            data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
            value={priorityFilter}
            onChange={onPriorityFilterChange}
            clearable
            size="xs"
            w={140}
          />
          <Select
            placeholder="All assignees"
            data={[{ value: '__none__', label: '— Unassigned —' }, ...assigneeOptions]}
            value={assigneeFilter}
            onChange={onAssigneeFilterChange}
            clearable
            searchable
            size="xs"
            w={220}
          />
          <Badge variant="light" size="sm" ml="auto">
            {filteredCount} of {totalCount}
          </Badge>
        </Group>
        <Group gap="sm" wrap="wrap">
          <Group gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed" fw={500} tt="uppercase">
              Attention
            </Text>
            <InfoTip
              width={320}
              label="Quick filter untuk tampilkan hanya task yang match kondisi: Overdue = past dueAt, Unassigned = tanpa assignee, Blocked = ada TaskDependency aktif, Stale = updatedAt > 7 hari."
              size={12}
            />
          </Group>
          <SegmentedControl
            size="xs"
            value={quick}
            onChange={(v) => onQuickChange(v as QuickFilter)}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Overdue', value: 'overdue' },
              { label: 'Unassigned', value: 'unassigned' },
              { label: 'Blocked', value: 'blocked' },
              { label: `Stale >${STALE_DAYS}d`, value: 'stale' },
            ]}
          />
          {hasFilters && (
            <Text
              size="xs"
              c="dimmed"
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={onClearFilters}
            >
              Clear
            </Text>
          )}
        </Group>
      </Stack>
    </Card>
  )
}
