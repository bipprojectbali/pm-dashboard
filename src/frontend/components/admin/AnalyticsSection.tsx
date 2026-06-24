import { SimpleGrid, Stack } from '@mantine/core'
import { DeadlineGroupsBlock } from './analyticssection/DeadlineGroups'
import { StatusDonuts } from './analyticssection/StatusDonuts'
import { TaskTrendBlock } from './analyticssection/TaskTrendBlock'
import { TimelineBlock } from './analyticssection/TimelineBlock'
import type { AnalyticsData } from './analyticssection/types'

export type { AnalyticsData } from './analyticssection/types'

export function AnalyticsSection({ data }: { data: AnalyticsData }) {
  return (
    <Stack gap="md">
      <TimelineBlock timeline={data.timeline} />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <StatusDonuts projectsByStatus={data.projectsByStatus} tasksByStatus={data.tasksByStatus} />
        <TaskTrendBlock trend={data.taskTrend} />
      </SimpleGrid>
      <DeadlineGroupsBlock groups={data.deadlineGroups} />
    </Stack>
  )
}
