import { Badge, Divider, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbLayoutDashboard } from 'react-icons/tb'
import { buildNavItems, TAB_META } from './navItems'
import type { TabKey } from './types'

export function PmPageHeader({ tabKey }: { tabKey: TabKey }) {
  const item = buildNavItems({ events: 0, tasks: 0, projects: 0, overdue: 0 }).find((n) => n.key === tabKey)
  const meta = TAB_META[tabKey]
  const Icon = item?.icon ?? TbLayoutDashboard
  return (
    <>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon variant="light" color="blue" size="xl" radius="md">
          <Icon size={22} />
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.6 }}>
              Manajer Proyek
            </Text>
            {item?.badge && (
              <Badge size="xs" variant="light" color="blue">
                {item.badge}
              </Badge>
            )}
          </Group>
          <Title order={3} style={{ lineHeight: 1.1 }}>
            {meta.label}
          </Title>
          <Text size="sm" c="dimmed">
            {meta.description}
          </Text>
        </Stack>
      </Group>
      <Divider />
    </>
  )
}
