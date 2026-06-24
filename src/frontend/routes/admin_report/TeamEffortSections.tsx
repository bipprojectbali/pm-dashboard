import { Badge, Card, Group, Progress, SimpleGrid, Stack, Table, Text } from '@mantine/core'
import { TbClockHour3, TbUsersGroup } from 'react-icons/tb'
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

export function EffortVarianceSection({ data }: { data: ReportPayload }) {
  const { overEstimate, underEstimate, totalAnalyzed } = data.effort
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbClockHour3}
        color="orange"
        title="Varian Effort"
        subtitle={`${totalAnalyzed} task dianalisis · estimasi vs aktual`}
      />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="sm">
        <div>
          <Text size="xs" fw={600} tt="uppercase" c="red" mb={6}>
            Overrun (aktual ≫ estimasi)
          </Text>
          {overEstimate.length === 0 ? (
            <Text size="xs" c="dimmed">
              Tidak ada.
            </Text>
          ) : (
            <Table withColumnBorders withTableBorder striped fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Task</Table.Th>
                  <Table.Th style={{ width: 70 }}>Est.</Table.Th>
                  <Table.Th style={{ width: 70 }}>Aktual</Table.Th>
                  <Table.Th style={{ width: 70 }}>Var</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {overEstimate.map((t) => (
                  <Table.Tr key={t.taskId}>
                    <Table.Td>
                      <Text size="xs" truncate>
                        {t.title}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {t.projectName}
                      </Text>
                    </Table.Td>
                    <Table.Td>{t.estimateHours ?? '—'}</Table.Td>
                    <Table.Td>{t.actualHours}</Table.Td>
                    <Table.Td>
                      <Text size="xs" c="red" fw={600}>
                        +{t.variancePercent ?? 0}%
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>
        <div>
          <Text size="xs" fw={600} tt="uppercase" c="teal" mb={6}>
            Underrun (aktual ≪ estimasi)
          </Text>
          {underEstimate.length === 0 ? (
            <Text size="xs" c="dimmed">
              Tidak ada.
            </Text>
          ) : (
            <Table withColumnBorders withTableBorder striped fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Task</Table.Th>
                  <Table.Th style={{ width: 70 }}>Est.</Table.Th>
                  <Table.Th style={{ width: 70 }}>Aktual</Table.Th>
                  <Table.Th style={{ width: 70 }}>Var</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {underEstimate.map((t) => (
                  <Table.Tr key={t.taskId}>
                    <Table.Td>
                      <Text size="xs" truncate>
                        {t.title}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {t.projectName}
                      </Text>
                    </Table.Td>
                    <Table.Td>{t.estimateHours ?? '—'}</Table.Td>
                    <Table.Td>{t.actualHours}</Table.Td>
                    <Table.Td>
                      <Text size="xs" c="teal" fw={600}>
                        {t.variancePercent ?? 0}%
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>
      </SimpleGrid>
    </Card>
  )
}
