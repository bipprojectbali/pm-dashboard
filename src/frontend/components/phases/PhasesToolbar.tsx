import { ActionIcon, Badge, Group, Select, TextInput, Tooltip } from '@mantine/core'
import { TbLayoutGrid, TbLayoutList, TbListDetails, TbSearch, TbTag } from 'react-icons/tb'
import {
  PHASE_STATUS_COLOR,
  PHASE_STATUS_ICON,
  PHASE_STATUS_LABEL,
  type PhaseStatus,
  type PhaseView,
  type TagOption,
} from '../phase.types'

const STATUSES: PhaseStatus[] = ['PLANNING', 'ACTIVE', 'COMPLETED']

const VIEW_OPTIONS: Array<{ value: PhaseView; label: string; Icon: typeof TbLayoutGrid }> = [
  { value: 'stepper', label: 'Stepper', Icon: TbListDetails },
  { value: 'grid', label: 'Grid', Icon: TbLayoutGrid },
  { value: 'list', label: 'List', Icon: TbLayoutList },
]

export function PhasesToolbar({
  search,
  onSearchChange,
  view,
  onViewChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  tagFilter,
  onTagFilterChange,
  availableTags,
}: {
  search: string
  onSearchChange: (v: string) => void
  view: PhaseView
  onViewChange: (v: PhaseView) => void
  statusFilter: PhaseStatus | 'ALL'
  onStatusFilterChange: (v: PhaseStatus | 'ALL') => void
  statusCounts: Record<PhaseStatus, number>
  tagFilter: string | null
  onTagFilterChange: (v: string | null) => void
  availableTags: TagOption[]
}) {
  const total = statusCounts.PLANNING + statusCounts.ACTIVE + statusCounts.COMPLETED

  return (
    <Group justify="space-between" align="center" gap="sm" wrap="wrap">
      <Group gap="xs" wrap="wrap">
        <TextInput
          size="xs"
          placeholder="Cari judul fase…"
          leftSection={<TbSearch size={13} />}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          w={200}
        />

        <Group gap={4} wrap="wrap">
          <Badge
            size="sm"
            variant={statusFilter === 'ALL' ? 'filled' : 'light'}
            color="gray"
            style={{ cursor: 'pointer' }}
            onClick={() => onStatusFilterChange('ALL')}
          >
            Semua ({total})
          </Badge>
          {STATUSES.map((s) => {
            const Icon = PHASE_STATUS_ICON[s]
            return (
              <Badge
                key={s}
                size="sm"
                variant={statusFilter === s ? 'filled' : 'light'}
                color={PHASE_STATUS_COLOR[s]}
                leftSection={<Icon size={11} />}
                style={{ cursor: 'pointer' }}
                onClick={() => onStatusFilterChange(s)}
              >
                {PHASE_STATUS_LABEL[s]} ({statusCounts[s]})
              </Badge>
            )
          })}
        </Group>

        {availableTags.length > 0 && (
          <Select
            size="xs"
            placeholder="Filter tag"
            leftSection={<TbTag size={13} />}
            data={availableTags.map((t) => ({ value: t.id, label: t.name }))}
            value={tagFilter}
            onChange={onTagFilterChange}
            clearable
            w={150}
          />
        )}
      </Group>

      <Group gap={4}>
        {VIEW_OPTIONS.map(({ value, label, Icon }) => (
          <Tooltip key={value} label={label}>
            <ActionIcon
              variant={view === value ? 'filled' : 'subtle'}
              color="blue"
              size="md"
              onClick={() => onViewChange(value)}
              aria-label={`Tampilan ${label}`}
            >
              <Icon size={16} />
            </ActionIcon>
          </Tooltip>
        ))}
      </Group>
    </Group>
  )
}
