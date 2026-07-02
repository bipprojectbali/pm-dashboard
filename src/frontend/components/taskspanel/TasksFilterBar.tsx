import { ActionIcon, Badge, Card, Collapse, Group, Stack, Text, Tooltip } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { TbChevronDown, TbChevronUp, TbFilter, TbX } from 'react-icons/tb'
import { SearchAndViewBar } from './SearchAndViewBar'
import { TasksAdvancedFilters } from './TasksAdvancedFilters'
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
          <TasksAdvancedFilters
            activeProject={activeProject}
            projects={projects}
            activeProjectId={activeProjectId}
            onProjectChange={onProjectChange}
            mine={mine}
            onMineChange={onMineChange}
            kind={kind}
            onKindChange={onKindChange}
            status={status}
            onStatusChange={onStatusChange}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={onPriorityFilterChange}
            tagFilter={tagFilter}
            onTagFilterChange={onTagFilterChange}
            tags={tags}
            sortBy={sortBy}
            onSortByChange={onSortByChange}
            sortDir={sortDir}
            onSortDirToggle={onSortDirToggle}
            dueDateRange={dueDateRange}
            onDueDateRangeChange={onDueDateRangeChange}
          />
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
