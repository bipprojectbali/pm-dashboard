import { ActionIcon, Badge, Divider, Group, Select, Stack, Text, Tooltip } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { TbFilter, TbSortAscending, TbSortDescending, TbTag, TbUser, TbX } from 'react-icons/tb'
import type { AdvancedFilterProps } from './types'

// The collapsible advanced-filter body: Scope / Tipe Task / Urutan / Tanggal Due.
// Split out of TasksFilterBar to keep each file within FILE-HEALTH limits.
export function TasksAdvancedFilters({
  activeProject,
  projects,
  activeProjectId,
  onProjectChange,
  assigneeFilter,
  onAssigneeFilterChange,
  members,
  kind,
  onKindChange,
  status,
  onStatusChange,
  priorityFilter,
  onPriorityFilterChange,
  tagFilter,
  onTagFilterChange,
  tags,
  sortBy,
  onSortByChange,
  sortDir,
  onSortDirToggle,
  dueDateRange,
  onDueDateRangeChange,
}: AdvancedFilterProps) {
  return (
    <Stack gap="sm">
      {/* Scope */}
      <Divider
        label={
          <Group gap={4}>
            <TbFilter size={11} />
            <Text size="xs" c="dimmed" fw={600}>
              Scope
            </Text>
          </Group>
        }
        labelPosition="left"
      />
      <Group gap="sm" wrap="wrap" align="center">
        {activeProject ? (
          <Badge
            color="blue"
            variant="light"
            size="lg"
            leftSection={<TbTag size={12} />}
            rightSection={
              <ActionIcon
                size="xs"
                variant="transparent"
                color="blue"
                onClick={() => onProjectChange(null)}
                aria-label="Clear project filter"
              >
                <TbX size={12} />
              </ActionIcon>
            }
          >
            {activeProject.name}
          </Badge>
        ) : (
          <Select
            placeholder="All projects"
            data={projects.map((p) => ({ value: p.id, label: p.name }))}
            value={activeProjectId}
            onChange={onProjectChange}
            clearable
            size="xs"
            w={220}
          />
        )}
        <Select
          placeholder="Semua assignee"
          leftSection={<TbUser size={12} />}
          data={[
            { value: 'me', label: 'Saya' },
            { value: 'unassigned', label: 'Unassigned' },
            ...members.map((m) => ({ value: m.id, label: m.name })),
          ]}
          value={assigneeFilter}
          onChange={onAssigneeFilterChange}
          clearable
          size="xs"
          w={200}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>

      {/* Tipe Task */}
      <Divider
        label={
          <Text size="xs" c="dimmed" fw={600}>
            Tipe Task
          </Text>
        }
        labelPosition="left"
      />
      <Group gap="sm" wrap="wrap" align="center">
        <Select
          placeholder="All kinds"
          data={['TASK', 'BUG', 'QC', 'TICKET', 'IDEA']}
          value={kind}
          onChange={onKindChange}
          clearable
          size="xs"
          w={130}
        />
        <Select
          placeholder="All statuses"
          data={['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED']}
          value={status}
          onChange={onStatusChange}
          clearable
          size="xs"
          w={160}
        />
        <Select
          placeholder="All priorities"
          data={[
            { value: 'CRITICAL', label: 'Critical' },
            { value: 'HIGH', label: 'High' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'LOW', label: 'Low' },
          ]}
          value={priorityFilter}
          onChange={onPriorityFilterChange}
          clearable
          size="xs"
          w={140}
        />
        {activeProjectId && tags.length > 0 && (
          <Select
            placeholder="All tags"
            leftSection={<TbTag size={12} />}
            data={tags.map((t) => ({ value: t.id, label: t.name }))}
            value={tagFilter}
            onChange={onTagFilterChange}
            clearable
            size="xs"
            w={155}
          />
        )}
      </Group>

      {/* Urutan */}
      <Divider
        label={
          <Text size="xs" c="dimmed" fw={600}>
            Urutan
          </Text>
        }
        labelPosition="left"
      />
      <Group gap="sm" wrap="wrap" align="center">
        <Select
          placeholder="Default order"
          data={[
            { value: 'dueAt', label: 'Due date' },
            { value: 'priority', label: 'Priority' },
            { value: 'title', label: 'Title (A–Z)' },
            { value: 'createdAt', label: 'Created' },
            { value: 'updatedAt', label: 'Updated' },
            { value: 'estimateHours', label: 'Estimate hours' },
          ]}
          value={sortBy}
          onChange={onSortByChange}
          clearable
          size="xs"
          w={170}
        />
        <Tooltip label={sortDir === 'asc' ? 'Ascending — klik untuk DESC' : 'Descending — klik untuk ASC'}>
          <ActionIcon variant="light" size="sm" disabled={!sortBy} onClick={onSortDirToggle}>
            {sortDir === 'asc' ? <TbSortAscending size={14} /> : <TbSortDescending size={14} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Tanggal Due */}
      <Divider
        label={
          <Text size="xs" c="dimmed" fw={600}>
            Tanggal Due
          </Text>
        }
        labelPosition="left"
      />
      <Group gap="sm" wrap="wrap" align="center">
        <DatePickerInput
          type="range"
          placeholder="Semua due date"
          value={dueDateRange}
          onChange={(v) => onDueDateRangeChange(v as [Date | null, Date | null])}
          clearable
          size="xs"
          w={260}
          valueFormat="DD MMM YYYY"
          getDayProps={(raw) => {
            const date = new Date(raw)
            const t = new Date()
            const isToday =
              date.getDate() === t.getDate() &&
              date.getMonth() === t.getMonth() &&
              date.getFullYear() === t.getFullYear()
            if (!isToday) return {}
            return {
              style: {
                backgroundColor: 'var(--mantine-color-orange-6)',
                color: '#fff',
                fontWeight: 700,
                borderRadius: 4,
              },
            }
          }}
        />
      </Group>
    </Stack>
  )
}
