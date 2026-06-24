import { Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import type { EChartsOption } from 'echarts'
import { TbChartDonut, TbInfoCircle } from 'react-icons/tb'
import { EChart } from '../../charts/EChart'
import { type AnalyticsData, PROJECT_STATUS_COLOR, TASK_STATUS_COLOR, type ProjectStatus, type TaskStatus } from './types'

function EmptyMini({ label }: { label: string }) {
  return (
    <Stack align="center" justify="center" h={200} gap={4}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="xs" c="dimmed">no data</Text>
    </Stack>
  )
}

export function StatusDonuts({
  projectsByStatus,
  tasksByStatus,
}: {
  projectsByStatus: AnalyticsData['projectsByStatus']
  tasksByStatus: AnalyticsData['tasksByStatus']
}) {
  const projectData = Object.entries(projectsByStatus).map(([status, count]) => ({
    name: status,
    value: count as number,
    itemStyle: { color: PROJECT_STATUS_COLOR[status as ProjectStatus] ?? '#868e96' },
  }))
  const taskData = Object.entries(tasksByStatus).map(([status, count]) => ({
    name: status,
    value: count as number,
    itemStyle: { color: TASK_STATUS_COLOR[status as TaskStatus] ?? '#868e96' },
  }))

  const buildOption = (data: typeof projectData, title: string): EChartsOption => ({
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

  const hasProject = projectData.some((d) => d.value > 0)
  const hasTask = taskData.some((d) => d.value > 0)

  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="grape" size="md" radius="md">
          <TbChartDonut size={16} />
        </ThemeIcon>
        <Title order={5}>Status breakdown</Title>
        <Tooltip multiline w={340} withArrow label="Dua donut: distribusi Projects (DRAFT/ACTIVE/ON_HOLD/COMPLETED/CANCELLED) dan distribusi Tasks (OPEN/IN_PROGRESS/READY_FOR_QC/REOPENED/CLOSED). Hover segmen untuk jumlah + persentase.">
          <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
            <TbInfoCircle size={14} />
          </ThemeIcon>
        </Tooltip>
      </Group>
      <SimpleGrid cols={2} spacing="xs">
        {hasProject ? <EChart option={buildOption(projectData, 'Projects')} height={200} /> : <EmptyMini label="Projects" />}
        {hasTask ? <EChart option={buildOption(taskData, 'Tasks')} height={200} /> : <EmptyMini label="Tasks" />}
      </SimpleGrid>
    </Card>
  )
}
