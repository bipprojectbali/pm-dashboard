import { ActionIcon, Badge, Card, Collapse, Divider, Group, Select, Stack, Switch, Text, Tooltip } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useLocalStorage } from '@mantine/hooks'
import { TbChevronDown, TbChevronUp, TbFilter, TbSortAscending, TbSortDescending, TbTag, TbX } from 'react-icons/tb'
import { SearchAndViewBar } from './SearchAndViewBar'
import type { ProjectOption, QuickFilter, TagListItem } from './types'

export function TasksFilterBar({
  activeProject,
  projects,
  activeProjectId,
  status,
  onStatusChange,
  kind,
  onKindChange,
  mine,
  onMineChange,
  tagFilter,
  onTagFilterChange,
  tags,
  search,
  onSearchChange,
  quickFilter,
  onQuickFilterChange,
  dueDateRange,
  onDueDateRangeChange,
  priorityFilter,
  onPriorityFilterChange,
  sortBy,
  onSortByChange,
  sortDir,
  onSortDirToggle,
  view,
  onViewChange,
  onProjectChange,
  total,
  taskCount,
  onExport,
  showClearAll,
  onClearAll,
}: {
  activeProject: ProjectOption | null
  projects: ProjectOption[]
  activeProjectId: string | null
  status: string | null
  onStatusChange: (v: string | null) => void
  kind: string | null
  onKindChange: (v: string | null) => void
  mine: boolean
  onMineChange: (v: boolean) => void
  tagFilter: string | null
  onTagFilterChange: (v: string | null) => void
  tags: TagListItem[]
  search: string
  onSearchChange: (v: string) => void
  quickFilter: QuickFilter
  onQuickFilterChange: (v: QuickFilter) => void
  dueDateRange: [Date | null, Date | null]
  onDueDateRangeChange: (v: [Date | null, Date | null]) => void
  priorityFilter: string | null
  onPriorityFilterChange: (v: string | null) => void
  sortBy: string | null
  onSortByChange: (v: string | null) => void
  sortDir: 'asc' | 'desc'
  onSortDirToggle: () => void
  view: 'table' | 'gantt' | 'kanban'
  onViewChange: (v: 'table' | 'gantt' | 'kanban') => void
  onProjectChange: (v: string | null) => void
  total: number
  taskCount: number
  onExport: () => void
  showClearAll: boolean
  onClearAll: () => void
}) {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>({
    key: 'pm:tasks:filterCollapsed',
    defaultValue: false,
  })

  // Hitung filter lanjutan yang sedang aktif (yang tersembunyi saat collapsed),
  // supaya user tahu ada filter berjalan tanpa harus membuka panel.
  const activeCount = [
    activeProjectId,
    mine || null,
    kind,
    status,
    priorityFilter,
    tagFilter,
    sortBy,
    dueDateRange[0] || dueDateRange[1] || null,
  ].filter(Boolean).length

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="sm">
        {/* Header collapse */}
        <Group justify="space-between" align="center">
          <Group gap={6} align="center">
            <TbFilter size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size="xs" c="dimmed" fw={600}>
              Filter
            </Text>
            {collapsed && activeCount > 0 && (
              <Badge size="sm" variant="filled" color="blue">
                {activeCount} aktif
              </Badge>
            )}
          </Group>
          <Group gap={4}>
            {collapsed && showClearAll && (
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClearAll} aria-label="Reset semua filter">
                <TbX size={14} />
              </ActionIcon>
            )}
            <Tooltip label={collapsed ? 'Tampilkan filter' : 'Sembunyikan filter'}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? 'Tampilkan filter' : 'Sembunyikan filter'}
              >
                {collapsed ? <TbChevronDown size={16} /> : <TbChevronUp size={16} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Collapse in={!collapsed}>
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
              <Switch
                label="Assigned to me"
                checked={mine}
                onChange={(e) => onMineChange(e.currentTarget.checked)}
                size="sm"
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
        </Collapse>

        {/* Cari & Tampilan — selalu terlihat, dipakai harian */}
        <SearchAndViewBar
          search={search}
          onSearchChange={onSearchChange}
          quickFilter={quickFilter}
          onQuickFilterChange={onQuickFilterChange}
          showClearAll={showClearAll}
          onClearAll={onClearAll}
          view={view}
          onViewChange={onViewChange}
          total={total}
          taskCount={taskCount}
          status={status}
          onExport={onExport}
        />
      </Stack>
    </Card>
  )
}
