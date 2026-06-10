import { ActionIcon, Badge, Card, Group, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import {
  TbActivity,
  TbAlertTriangle,
  TbCheck,
  TbDatabase,
  TbRefresh,
  TbServer,
  TbShieldLock,
} from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'

type ServiceStatus = { ok: boolean; latencyMs: number | null; error: string | null }

interface HealthResponse {
  timestamp: string
  services: {
    db: ServiceStatus
    redis: ServiceStatus
  }
  sessions: { total: number; active: number; online: number }
  retention: {
    auditLogDays: number
    auditLogCount: number
  }
  env: { key: string; set: boolean; required: boolean; note?: string }[]
}

export function SystemHealthPanel() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () =>
      fetch('/api/admin/health', { credentials: 'include' }).then((r) => r.json()) as Promise<HealthResponse>,
    refetchInterval: 20_000,
  })

  const anyCriticalDown = data ? !data.services.db.ok || !data.services.redis.ok : false
  const envMissingRequired = data ? data.env.filter((e) => e.required && !e.set) : []

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Group gap="xs">
            <Title order={3}>System Health</Title>
            <InfoTip
              width={360}
              label="Status realtime infrastruktur: database, redis, sesi aktif, retensi log, dan env vars. Endpoint: GET /api/admin/health, poll 20 detik."
            />
          </Group>
          <Text size="sm" c="dimmed">
            Status operasional service + konfigurasi. Auto-refresh 20 detik.
          </Text>
        </div>
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" onClick={() => refetch()} loading={isFetching}>
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {(anyCriticalDown || envMissingRequired.length > 0) && data && (
        <Card withBorder padding="md" radius="md" bg="red.0">
          <Group gap="sm" align="flex-start">
            <TbAlertTriangle size={20} color="var(--mantine-color-red-7)" />
            <Stack gap={4} style={{ flex: 1 }}>
              <Text fw={600} size="sm" c="red.9">
                Attention needed
              </Text>
              {!data.services.db.ok && (
                <Text size="xs" c="red.8">
                  Database down: {data.services.db.error}
                </Text>
              )}
              {!data.services.redis.ok && (
                <Text size="xs" c="red.8">
                  Redis down: {data.services.redis.error}
                </Text>
              )}
              {envMissingRequired.map((e) => (
                <Text key={e.key} size="xs" c="red.8">
                  Required env missing: {e.key}
                </Text>
              ))}
            </Stack>
          </Group>
        </Card>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <ServiceCard label="Database" service={data?.services.db} loading={isLoading} icon={<TbDatabase size={22} />} />
        <ServiceCard label="Redis" service={data?.services.redis} loading={isLoading} icon={<TbServer size={22} />} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder padding="md" radius="md">
          <Stack gap="sm">
            <Group gap="xs">
              <TbActivity size={16} />
              <Title order={5}>Sessions</Title>
              <InfoTip
                width={320}
                label="Sesi login user yang tersimpan di tabel Session. Active = belum expired. Online = user sedang terkoneksi WebSocket presence."
              />
            </Group>
            <SimpleGrid cols={3} spacing="xs">
              <Stat
                label="Total"
                value={data?.sessions.total ?? '—'}
                color="blue"
                tip="Jumlah seluruh row Session di DB (termasuk yang sudah expired tapi belum di-cleanup)."
              />
              <Stat
                label="Active"
                value={data?.sessions.active ?? '—'}
                color="teal"
                tip="Session dengan expiresAt > sekarang. User masih login, cookie masih valid."
              />
              <Stat
                label="Online"
                value={data?.sessions.online ?? '—'}
                color="green"
                tip="User yang sedang terkoneksi via WebSocket /ws/presence. Subset dari Active — lagi buka app di tab."
              />
            </SimpleGrid>
          </Stack>
        </Card>

        <Card withBorder padding="md" radius="md">
          <Stack gap="sm">
            <Group gap="xs">
              <TbShieldLock size={16} />
              <Title order={5}>Log Retention</Title>
              <InfoTip
                width={340}
                label="Retensi log audit di DB. Auto-cleanup menghapus row lebih tua dari window. Jalan saat startup + setiap 24 jam. Dikendalikan env AUDIT_LOG_RETENTION_DAYS (default 90)."
              />
            </Group>
            <SimpleGrid cols={1} spacing="xs">
              <Stat
                label={`Audit (${data?.retention.auditLogDays ?? '—'}d)`}
                value={data?.retention.auditLogCount ?? '—'}
                color="blue"
                tip="Jumlah AuditLog rows saat ini. Menyimpan login/role change/block untuk compliance. Window dari AUDIT_LOG_RETENTION_DAYS."
              />
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              Auto-cleanup berjalan saat startup + setiap 24 jam.
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder padding={0} radius="md">
        <Group p="md" gap="xs">
          <TbShieldLock size={16} />
          <Title order={5}>Environment Variables</Title>
          <InfoTip
            width={340}
            label="Daftar env vars yang dibaca app. Required = app tidak jalan tanpa ini (DATABASE_URL, REDIS_URL, dll). Unset + required = ⚠ blocker. Optional boleh kosong."
          />
        </Group>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Variable</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Required</Table.Th>
              <Table.Th>Note</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.env ?? []).map((e) => (
              <Table.Tr key={e.key}>
                <Table.Td>
                  <Text size="sm" ff="monospace">
                    {e.key}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {e.set ? (
                    <Badge color="teal" variant="light" size="sm" leftSection={<TbCheck size={10} />}>
                      set
                    </Badge>
                  ) : (
                    <Badge color={e.required ? 'red' : 'gray'} variant="light" size="sm">
                      unset
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  {e.required ? (
                    <Badge color="red" variant="filled" size="xs">
                      required
                    </Badge>
                  ) : (
                    <Text size="xs" c="dimmed">
                      optional
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {e.note ? (
                    <Text size="xs" c="dimmed">
                      {e.note}
                    </Text>
                  ) : null}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  )
}

function ServiceCard({
  label,
  service,
  loading,
  icon,
}: {
  label: string
  service: ServiceStatus | undefined
  loading: boolean
  icon: React.ReactNode
}) {
  const status = !service ? 'unknown' : service.ok ? 'ok' : 'down'
  const color = status === 'ok' ? 'teal' : status === 'down' ? 'red' : 'gray'
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="md" wrap="nowrap" align="center">
        <div style={{ color: `var(--mantine-color-${color}-6)` }}>{icon}</div>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs">
            <Text fw={600} size="sm">
              {label}
            </Text>
            <Badge color={color} variant="light" size="sm">
              {loading ? 'checking...' : status === 'ok' ? 'healthy' : status === 'down' ? 'down' : 'unknown'}
            </Badge>
          </Group>
          {service?.ok && service.latencyMs !== null && (
            <Text size="xs" c="dimmed">
              Latency: {service.latencyMs}ms
            </Text>
          )}
          {service && !service.ok && service.error && (
            <Text size="xs" c="red" lineClamp={2}>
              {service.error}
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  )
}

function Stat({ label, value, color, tip }: { label: string; value: string | number; color: string; tip?: string }) {
  return (
    <div>
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c="dimmed" fw={500} tt="uppercase">
          {label}
        </Text>
        {tip && <InfoTip label={tip} size={11} />}
      </Group>
      <Text fw={700} size="lg" c={color === 'dimmed' ? undefined : color}>
        {value}
      </Text>
    </div>
  )
}
