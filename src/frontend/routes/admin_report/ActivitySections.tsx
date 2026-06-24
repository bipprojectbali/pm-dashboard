import { Badge, Card, SimpleGrid, Table, Text } from '@mantine/core'
import { TbBrandGithub, TbHistory } from 'react-icons/tb'
import { RiskStat, SectionHeader } from './shared'
import type { ReportPayload } from './types'

export function GithubActivitySection({ data }: { data: ReportPayload }) {
  const g = data.github
  const total = g.commits + g.prsOpened + g.prsMerged + g.reviews
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbBrandGithub}
        color="dark"
        title="Aktivitas GitHub"
        subtitle={`Periode berjalan · ${total} event`}
      />
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xs" mt="sm" mb="md">
        <RiskStat label="Commits" value={g.commits} color="blue" />
        <RiskStat label="PR Dibuka" value={g.prsOpened} color="teal" />
        <RiskStat label="PR Merged" value={g.prsMerged} color="violet" />
        <RiskStat label="Review" value={g.reviews} color="orange" />
      </SimpleGrid>
      {g.byProject.length === 0 ? (
        <Text size="sm" c="dimmed">
          Belum ada aktivitas GitHub di periode ini.
        </Text>
      ) : (
        <Table withColumnBorders withTableBorder striped fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Proyek</Table.Th>
              <Table.Th>Repo</Table.Th>
              <Table.Th style={{ width: 80 }}>Commits</Table.Th>
              <Table.Th style={{ width: 80 }}>PR Open</Table.Th>
              <Table.Th style={{ width: 80 }}>PR Merged</Table.Th>
              <Table.Th style={{ width: 80 }}>Review</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {g.byProject.slice(0, 15).map((p) => (
              <Table.Tr key={p.projectId}>
                <Table.Td>{p.projectName}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {p.repo ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>{p.commits}</Table.Td>
                <Table.Td>{p.prsOpened}</Table.Td>
                <Table.Td>{p.prsMerged}</Table.Td>
                <Table.Td>{p.reviews}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  )
}

export function AuditHighlightsSection({ data }: { data: ReportPayload }) {
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbHistory}
        color="gray"
        title="Highlight Audit"
        subtitle={`${data.audit.length} event terbaru non-login`}
      />
      {data.audit.length === 0 ? (
        <Text size="sm" c="dimmed">
          Tidak ada aktivitas audit di periode ini.
        </Text>
      ) : (
        <Table withColumnBorders withTableBorder striped fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 150 }}>Waktu</Table.Th>
              <Table.Th style={{ width: 180 }}>Aksi</Table.Th>
              <Table.Th>Detail</Table.Th>
              <Table.Th style={{ width: 200 }}>Oleh</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.audit.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(a.createdAt).toLocaleString('id-ID')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" variant="light">
                    {a.action}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" truncate>
                    {a.detail ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">{a.userName ?? a.userEmail ?? '—'}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  )
}

export function FooterSection({ data }: { data: ReportPayload }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <Text size="xs" c="dimmed">
        Dibuat otomatis oleh pm-dashboard · {new Date(data.generatedAt).toLocaleString('id-ID')} ·{' '}
        {data.generatedBy.email}
      </Text>
    </div>
  )
}
