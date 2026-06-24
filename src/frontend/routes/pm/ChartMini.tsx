import { Card, Group, Stack, Text } from '@mantine/core'
import { EChart } from '@/frontend/components/charts/EChart'
import { InfoTip } from '@/frontend/components/shared/InfoTip'

export function ChartMini({
  title,
  subtitle,
  option,
  height = 180,
  tip,
}: {
  title: string
  subtitle?: string
  option: Parameters<typeof EChart>[0]['option']
  height?: number
  tip?: string
}) {
  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap={2} mb={4}>
        <Group gap={4} wrap="nowrap">
          <Text fw={600} size="sm">
            {title}
          </Text>
          {tip && <InfoTip label={tip} size={12} />}
        </Group>
        {subtitle && (
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        )}
      </Stack>
      <EChart option={option} height={height} />
    </Card>
  )
}
