import { ActionIcon, Badge, Group, SegmentedControl, Text, Tooltip } from '@mantine/core'
import { TbAlertTriangle, TbCalendarEvent, TbCalendarOff } from 'react-icons/tb'
import { type ViewMode, VIEW_OPTIONS } from './types'

type Props = {
  taskCount: number
  withoutDates: number
  overdueCount: number
  saving: boolean
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  onScrollToToday: () => void
}

export function GanttToolbar({
  taskCount,
  withoutDates,
  overdueCount,
  saving,
  viewMode,
  onViewModeChange,
  onScrollToToday,
}: Props) {
  return (
    <Group justify="space-between" align="center" wrap="nowrap">
      <Group gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed">
          {taskCount} task &middot; seret bar untuk reschedule &middot; klik untuk detail
        </Text>
        {overdueCount > 0 && (
          <Tooltip label={`${overdueCount} task melewati deadline`} withArrow>
            <Badge size="xs" color="red" variant="light" leftSection={<TbAlertTriangle size={10} />}>
              {overdueCount} overdue
            </Badge>
          </Tooltip>
        )}
        {withoutDates > 0 && (
          <Tooltip
            label={`${withoutDates} task tidak ditampilkan karena belum memiliki due date`}
            withArrow
          >
            <Badge size="xs" color="gray" variant="outline" leftSection={<TbCalendarOff size={10} />}>
              +{withoutDates} tanpa jadwal
            </Badge>
          </Tooltip>
        )}
        {saving && (
          <Badge size="xs" color="blue" variant="dot">
            Menyimpan&hellip;
          </Badge>
        )}
      </Group>
      <Group gap="xs" wrap="nowrap">
        <Tooltip label="Scroll ke hari ini" withArrow>
          <ActionIcon variant="light" size="sm" color="red" onClick={onScrollToToday}>
            <TbCalendarEvent size={14} />
          </ActionIcon>
        </Tooltip>
        <SegmentedControl
          size="xs"
          value={viewMode}
          onChange={(v) => onViewModeChange(v as ViewMode)}
          data={VIEW_OPTIONS}
          style={{ flexShrink: 0 }}
        />
      </Group>
    </Group>
  )
}
