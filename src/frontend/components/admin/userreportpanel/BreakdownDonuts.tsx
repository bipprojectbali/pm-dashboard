import { Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import type { EChartsOption } from 'echarts'
import { TbChartDonut, TbInfoCircle } from 'react-icons/tb'
import { EChart } from '../../charts/EChart'
import { PRIORITY_COLOR, STATUS_COLOR, type UserReportData } from './types'

function EmptyMini({ label }: { label: string }) {
  return (
    <Stack align="center" justify="center" h={180} gap={4}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="xs" c="dimmed">no data</Text>
    </Stack>
  )
}

export function BreakdownDonuts({
  byStatus,
  byPriority,
  className,
  renderer,
}: {
  byStatus: UserReportData['byStatus']
  byPriority: UserReportData['byPriority']
  className?: string
  renderer?: 'canvas' | 'svg'
}) {
  const statusData = Object.entries(byStatus).map(([status, count]) => ({
    name: status,
    value: count,
    itemStyle: { color: STATUS_COLOR[status] ?? '#868e96' },
  }))
  const priorityData = Object.entries(byPriority).map(([priority, count]) => ({
    name: priority,
    value: count,
    itemStyle: { color: PRIORITY_COLOR[priority] ?? '#868e96' },
  }))

  const buildOption = (data: typeof statusData, title: string): EChartsOption => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center', icon: 'circle', textStyle: { fontSize: 11 } },
    title: { text: title, left: 'center', top: 6, textStyle: { fontSize: 12, fontWeight: 'normal' } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        data,
      },
    ],
  })

  const hasStatus = statusData.some((d) => d.value > 0)
  const hasPriority = priorityData.some((d) => d.value > 0)

  return (
    <Card withBorder padding="md" radius="md" className={className}>
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="grape" size="md" radius="md">
          <TbChartDonut size={16} />
        </ThemeIcon>
        <Title order={5}>Task breakdown</Title>
        <Tooltip multiline w={320} withArrow label="Distribusi task user ini per status dan per priority.">
          <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
            <TbInfoCircle size={14} />
          </ThemeIcon>
        </Tooltip>
      </Group>
      <SimpleGrid cols={2} spacing="xs">
        {hasStatus ? <EChart option={buildOption(statusData, 'Status')} height={180} renderer={renderer} /> : <EmptyMini label="Status" />}
        {hasPriority ? <EChart option={buildOption(priorityData, 'Priority')} height={180} renderer={renderer} /> : <EmptyMini label="Priority" />}
      </SimpleGrid>
    </Card>
  )
}
