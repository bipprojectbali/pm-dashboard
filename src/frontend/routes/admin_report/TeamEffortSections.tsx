import { Badge, Card, Group, Progress, Stack, Text } from '@mantine/core'
import { TbUsersGroup } from 'react-icons/tb'
import { SectionHeader } from './shared'
import type { ReportPayload } from './types'

export function TeamLoadSection({ data }: { data: ReportPayload }) {
  const rows = data.load.rows.slice(0, 12)
  const maxOpen = rows.reduce((m, r) => Math.max(m, r.open), 0) || 1
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbUsersGroup}
        color="cyan"
        title="Beban Tim"
        subtitle={`${data.load.count} anggota · diurutkan berdasarkan task terbuka`}
      />
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          Belum ada assignment aktif.
        </Text>
      ) : (
        <Stack gap={6} mt="sm">
          {rows.map((r) => {
            const pct = (r.open / maxOpen) * 100
            const color = r.overloaded ? 'red' : r.open > 5 ? 'orange' : 'blue'
            return (
              <div key={r.userId ?? r.email ?? r.name}>
                <Group justify="space-between" mb={2}>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {r.name}
                    </Text>
                    {r.overloaded && (
                      <Badge size="xs" color="red" variant="light">
                        OVERLOAD
                      </Badge>
                    )}
                    {r.role && (
                      <Text size="xs" c="dimmed">
                        {r.role}
                      </Text>
                    )}
                  </Group>
                  <Group gap="sm">
                    <Text size="xs" c="dimmed">
                      {r.open} open
                    </Text>
                    {r.overdue > 0 && (
                      <Text size="xs" c="red">
                        {r.overdue} overdue
                      </Text>
                    )}
                    {r.estimateHours > 0 && (
                      <Text size="xs" c="dimmed">
                        {r.estimateHours}h est
                      </Text>
                    )}
                    <Text size="xs" c="teal">
                      {r.closed7d} selesai/7d
                    </Text>
                  </Group>
                </Group>
                <Progress value={pct} color={color} size="sm" />
              </div>
            )
          })}
        </Stack>
      )}
    </Card>
  )
}
