import { ActionIcon, Badge, Card, Group, Pagination, SegmentedControl, Stack, Table, Text, Title, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbFileText, TbRefresh, TbTrash } from 'react-icons/tb'
import { EmptyRow } from '@/frontend/components/shared/EmptyState'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

interface AppLogEntry {
  id: number
  level: 'info' | 'warn' | 'error'
  message: string
  detail?: string
  timestamp: string
}

const levelBadge: Record<string, { color: string }> = {
  info: { color: 'blue' },
  warn: { color: 'yellow' },
  error: { color: 'red' },
}

const PAGE_SIZE = 25

export function AppLogsPanel() {
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'logs', 'app', levelFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '200' })
      if (levelFilter !== 'all') params.set('level', levelFilter)
      return fetch(`/api/admin/logs/app?${params}`, { credentials: 'include' }).then((r) => r.json()) as Promise<{
        logs: AppLogEntry[]
      }>
    },
    refetchInterval: 5000,
  })

  const clearLogs = useMutation({
    mutationFn: () => fetch('/api/admin/logs/app', { method: 'DELETE', credentials: 'include' }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'logs', 'app'] })
      notifySuccess({ message: 'App log dikosongkan.' })
    },
    onError: (err) => notifyError(err),
  })

  const logs = data?.logs ?? []
  const ordered = [...logs].reverse()
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedLogs = ordered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  useEffect(() => {
    setPage(1)
  }, [])

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap="sm">
          <Title order={3}>App Logs</Title>
          <Badge variant="light" color="gray" size="sm">
            redis
          </Badge>
        </Group>
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={levelFilter}
            onChange={setLevelFilter}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Info', value: 'info' },
              { label: 'Warn', value: 'warn' },
              { label: 'Error', value: 'error' },
            ]}
          />
          <Tooltip label="Clear all">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => {
                if (confirm('Hapus semua app logs?')) clearLogs.mutate()
              }}
              loading={clearLogs.isPending}
            >
              <TbTrash size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" color="gray" onClick={() => refetch()} loading={isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Card withBorder radius="md" p={0}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={180}>Time</Table.Th>
              <Table.Th w={70}>Level</Table.Th>
              <Table.Th>Message</Table.Th>
              <Table.Th>Detail</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <EmptyRow icon={TbFileText} title="Memuat log…" />
                </Table.Td>
              </Table.Tr>
            )}
            {logs.length === 0 && !isLoading && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <EmptyRow
                    icon={TbFileText}
                    title="Belum ada log"
                    message="Log akan muncul saat ada request/error. Logs tersimpan di Redis dengan retensi 500 entry."
                  />
                </Table.Td>
              </Table.Tr>
            )}
            {pagedLogs.map((log) => {
              const badge = levelBadge[log.level] ?? levelBadge.info
              return (
                <Table.Tr key={log.id}>
                  <Table.Td>
                    <Text size="xs" ff="monospace" c="dimmed">
                      {new Date(log.timestamp).toLocaleString('id-ID', { hour12: false })}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={badge.color} variant="light" size="xs" tt="uppercase">
                      {log.level}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {log.message}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {log.detail ?? '—'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Card>

      {ordered.length > PAGE_SIZE && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, ordered.length)} of {ordered.length}
          </Text>
          <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Stack>
  )
}
