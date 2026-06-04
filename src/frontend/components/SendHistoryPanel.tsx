import { ActionIcon, Badge, Card, Group, Loader, Stack, Table, Text, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbRefresh, TbSend } from 'react-icons/tb'
import type { SendHistoryEntry } from '../../lib/report-history'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

const TRIGGER_COLOR: Record<string, string> = { cron: 'blue', manual: 'violet', custom: 'teal' }
const TRIGGER_LABEL: Record<string, string> = { cron: 'Otomatis', manual: 'Manual', custom: 'Custom' }

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SendHistoryPanel() {
  const qc = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'report-send-history'],
    queryFn: () => apiFetch<{ history: SendHistoryEntry[] }>('/api/admin/report/send-history'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const sendNow = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/send-now', { method: 'POST' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'report-send-history'] })
      if (res.ok) notifications.show({ color: 'teal', title: 'Terkirim', message: res.message })
      else notifications.show({ color: 'red', title: 'Gagal', message: res.message })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const history = data?.history ?? []

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Stack gap={0}>
            <Text fw={500} size="sm">
              Riwayat Pengiriman Laporan
            </Text>
            <Text size="xs" c="dimmed">
              20 pengiriman terakhir — otomatis (cron), manual, dan custom.
            </Text>
          </Stack>
          <Tooltip label="Refresh" withArrow>
            <ActionIcon variant="subtle" size="sm" onClick={() => refetch()} loading={isFetching}>
              <TbRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {isLoading && (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        )}

        {!isLoading && history.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Belum ada riwayat pengiriman.
          </Text>
        )}

        {history.length > 0 && (
          <Table.ScrollContainer minWidth={500}>
            <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 200 }}>Waktu Kirim</Table.Th>
                  <Table.Th style={{ width: 90 }}>Trigger</Table.Th>
                  <Table.Th style={{ width: 80 }}>Status</Table.Th>
                  <Table.Th>Pesan</Table.Th>
                  <Table.Th style={{ width: 40 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((entry, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <Text size="xs">{fmtTs(entry.sentAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={TRIGGER_COLOR[entry.trigger] ?? 'gray'}>
                        {TRIGGER_LABEL[entry.trigger] ?? entry.trigger}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={entry.ok ? 'teal' : 'red'}>
                        {entry.ok ? 'OK' : 'Gagal'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {entry.message}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Kirim ulang laporan sekarang" withArrow>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="blue"
                          loading={sendNow.isPending}
                          onClick={() => sendNow.mutate()}
                        >
                          <TbSend size={13} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  )
}
