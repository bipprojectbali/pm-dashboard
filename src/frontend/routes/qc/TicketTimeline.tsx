import { Box, Text, Timeline } from '@mantine/core'
import { TbClockHour4 } from 'react-icons/tb'
import type { TicketDetail } from './types'

export function TicketTimeline({ statusChanges }: { statusChanges: TicketDetail['statusChanges'] }) {
  if (statusChanges.length === 0) return null
  return (
    <Box>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb="xs">Timeline</Text>
      <Timeline active={statusChanges.length} bulletSize={18} lineWidth={2}>
        {statusChanges.map((sc) => (
          <Timeline.Item
            key={sc.id}
            bullet={<TbClockHour4 size={10} />}
            title={`${sc.fromStatus} → ${sc.toStatus}`}
          >
            <Text size="xs" c="dimmed">
              {sc.author?.name ?? 'System'} • {new Date(sc.createdAt).toLocaleString()}
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>
    </Box>
  )
}
