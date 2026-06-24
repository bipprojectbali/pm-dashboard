import { Badge, Divider, Group, Text } from '@mantine/core'
import { OVERDUE_COLOR, STATUS_COLOR } from './types'

type GanttStats = {
  open: number
  inProgress: number
  qc: number
  reopened: number
  closed: number
  overdue: number
}

type Props = {
  stats: GanttStats
  totalCount: number
}

export function GanttStatsBar({ stats, totalCount }: Props) {
  const statusBadges = [
    { count: stats.open, label: 'Open', color: STATUS_COLOR.OPEN },
    { count: stats.inProgress, label: 'In Progress', color: STATUS_COLOR.IN_PROGRESS },
    { count: stats.qc, label: 'QC', color: STATUS_COLOR.READY_FOR_QC },
    { count: stats.reopened, label: 'Reopened', color: STATUS_COLOR.REOPENED },
    { count: stats.closed, label: 'Closed', color: STATUS_COLOR.CLOSED },
  ]

  return (
    <Group gap={6} wrap="wrap">
      {statusBadges
        .filter((s) => s.count > 0)
        .map((s) => (
          <Badge
            key={s.label}
            size="sm"
            variant="default"
            style={{ border: 'none' }}
            leftSection={
              <div
                style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }}
              />
            }
          >
            {s.count} {s.label}
          </Badge>
        ))}
      {stats.overdue > 0 && (
        <Badge
          size="sm"
          variant="default"
          style={{ border: 'none' }}
          leftSection={
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: OVERDUE_COLOR,
                flexShrink: 0,
              }}
            />
          }
        >
          {stats.overdue} Overdue
        </Badge>
      )}
      <Divider orientation="vertical" />
      <Text size="xs" c="dimmed">
        Total {totalCount}
      </Text>
    </Group>
  )
}
