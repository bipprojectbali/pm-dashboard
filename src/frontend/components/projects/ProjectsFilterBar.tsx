import { ActionIcon, Box, Button, Card, Group, Select, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import {
  TbArrowsSort,
  TbCalendarEvent,
  TbFilterX,
  TbLayoutGrid,
  TbLayoutList,
  TbTarget,
  TbUsers,
} from 'react-icons/tb'
import { UserFilterStrip } from './UserFilterStrip'
import { PRIORITY_OPTIONS, SORT_OPTIONS, type MemberRole, type ProjectListItem, type ProjectPriority, type SortKey } from './types'

export function ProjectsFilterBar({
  scope,
  setScope,
  priorityFilter,
  setPriorityFilter,
  userFilter,
  setUserFilter,
  userFilterMode,
  setUserFilterMode,
  sort,
  setSort,
  density,
  setDensity,
  view,
  setView,
  groupByStatus,
  setGroupByStatus,
  userList,
  userOptions,
  hasActiveFilters,
  filtered,
  projects,
  clearFilters,
}: {
  scope: 'mine' | 'all'
  setScope: (v: 'mine' | 'all') => void
  priorityFilter: ProjectPriority | null
  setPriorityFilter: (v: ProjectPriority | null) => void
  userFilter: string | null
  setUserFilter: (v: string | null) => void
  userFilterMode: 'avatar' | 'dropdown'
  setUserFilterMode: (v: 'avatar' | 'dropdown') => void
  sort: SortKey
  setSort: (v: SortKey) => void
  density: 'comfortable' | 'compact'
  setDensity: (v: 'comfortable' | 'compact') => void
  view: 'grid' | 'list' | 'timeline'
  setView: (v: 'grid' | 'list' | 'timeline') => void
  groupByStatus: boolean
  setGroupByStatus: (v: boolean) => void
  userList: Array<{ id: string; name: string; image?: string | null }>
  userOptions: Array<{ value: string; label: string }>
  hasActiveFilters: boolean
  filtered: ProjectListItem[]
  projects: ProjectListItem[]
  clearFilters: () => void
  roleFilter?: MemberRole | null
}) {
  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Group gap="xs" wrap="wrap" justify="flex-end">
          <SegmentedControl
            size="xs"
            value={scope}
            onChange={(v) => setScope(v as 'mine' | 'all')}
            data={[
              { value: 'mine', label: 'Proyek saya' },
              { value: 'all', label: 'Semua proyek' },
            ]}
          />
          <Select
            size="xs"
            w={140}
            placeholder="Any priority"
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as ProjectPriority | null)}
            data={PRIORITY_OPTIONS}
            clearable
          />
          {userFilterMode === 'dropdown' && (
            <Group gap={4} wrap="nowrap" align="center">
              <Select
                size="xs"
                w={180}
                placeholder="Any user"
                value={userFilter}
                onChange={setUserFilter}
                data={userOptions}
                leftSection={<TbUsers size={12} />}
                searchable
                clearable
                nothingFoundMessage="No users"
              />
              <Tooltip label="Tampilkan sebagai avatar" withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setUserFilterMode('avatar')}>
                  <TbLayoutGrid size={13} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
          <Select
            size="xs"
            w={190}
            value={sort}
            onChange={(v) => v && setSort(v as SortKey)}
            data={SORT_OPTIONS}
            leftSection={<TbArrowsSort size={12} />}
            allowDeselect={false}
          />
          <SegmentedControl
            size="xs"
            value={density}
            onChange={(v) => setDensity(v as 'comfortable' | 'compact')}
            data={[
              { value: 'comfortable', label: 'Comfy' },
              { value: 'compact', label: 'Dense' },
            ]}
          />
          <Group gap={2}>
            <Tooltip label="Grid view">
              <ActionIcon
                size="sm"
                variant={view === 'grid' ? 'filled' : 'subtle'}
                color={view === 'grid' ? 'blue' : 'gray'}
                onClick={() => setView('grid')}
              >
                <TbLayoutGrid size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="List view">
              <ActionIcon
                size="sm"
                variant={view === 'list' ? 'filled' : 'subtle'}
                color={view === 'list' ? 'blue' : 'gray'}
                onClick={() => setView('list')}
              >
                <TbLayoutList size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Timeline">
              <ActionIcon
                size="sm"
                variant={view === 'timeline' ? 'filled' : 'subtle'}
                color={view === 'timeline' ? 'blue' : 'gray'}
                onClick={() => setView('timeline')}
              >
                <TbCalendarEvent size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Tooltip label={groupByStatus ? 'Matikan pengelompokan' : 'Kelompokkan per status'}>
            <ActionIcon
              size="sm"
              variant={groupByStatus ? 'filled' : 'subtle'}
              color={groupByStatus ? 'blue' : 'gray'}
              onClick={() => setGroupByStatus(!groupByStatus)}
            >
              <TbTarget size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        {userFilterMode === 'avatar' && userList.length > 0 && (
          <Box py={16} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            <UserFilterStrip
              users={userList}
              value={userFilter}
              onChange={setUserFilter}
              onSwitchMode={() => setUserFilterMode('dropdown')}
            />
          </Box>
        )}
        {hasActiveFilters && (
          <Group justify="space-between" gap="xs">
            <Text size="xs" c="dimmed">
              Showing <b>{filtered.length}</b> of {projects.length}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<TbFilterX size={12} />}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  )
}
