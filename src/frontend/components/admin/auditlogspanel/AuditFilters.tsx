import { Group, SegmentedControl, Select, Text, Tooltip } from '@mantine/core'
import { TbFileText, TbUser } from 'react-icons/tb'
import { actionBadge, WINDOW_OPTIONS } from './constants'

type Props = {
  windowFilter: string
  onWindowFilterChange: (v: string) => void
  userFilter: string | null
  onUserFilterChange: (v: string | null) => void
  userOptions: { value: string; label: string }[]
  actionFilter: string | null
  onActionFilterChange: (v: string | null) => void
  total: number
}

const actionOptions = Object.entries(actionBadge).map(([key, val]) => ({ value: key, label: val.label }))

export function AuditFilters({
  windowFilter,
  onWindowFilterChange,
  userFilter,
  onUserFilterChange,
  userOptions,
  actionFilter,
  onActionFilterChange,
  total,
}: Props) {
  return (
    <Group gap="sm" wrap="wrap">
      <Tooltip label="Filter rentang waktu data yang ditampilkan di tabel di bawah. Stat cards & tren chart tetap pakai window 24j / 14 hari.">
        <SegmentedControl
          size="xs"
          value={windowFilter}
          onChange={onWindowFilterChange}
          data={WINDOW_OPTIONS}
        />
      </Tooltip>
      <Select
        placeholder="Filter user"
        data={userOptions}
        value={userFilter}
        onChange={onUserFilterChange}
        clearable
        searchable
        size="xs"
        w={250}
        leftSection={<TbUser size={14} />}
      />
      <Select
        placeholder="Filter action"
        data={actionOptions}
        value={actionFilter}
        onChange={onActionFilterChange}
        clearable
        size="xs"
        w={220}
        leftSection={<TbFileText size={14} />}
      />
      <Text size="xs" c="dimmed" ml="auto">
        {total} entri
      </Text>
    </Group>
  )
}
