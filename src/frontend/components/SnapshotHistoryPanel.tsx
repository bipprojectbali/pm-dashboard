import { ActionIcon, Button, Card, Group, Loader, Stack, Table, Text, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbCamera, TbRefresh } from 'react-icons/tb'
import type { DailySnapshotData } from '../../lib/daily-snapshot.types'
import { SnapshotRow } from './SnapshotHistoryRow'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function SnapshotHistoryPanel() {
  const qc = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'report-snapshots'],
    queryFn: () => apiFetch<{ snapshots: DailySnapshotData[] }>('/api/admin/report/snapshots?days=30'),
    staleTime: 5 * 60_000,
  })

  const snapshots = (data?.snapshots ?? []).slice().reverse()

  const capture = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; error?: string }>('/api/admin/report/snapshots/capture', { method: 'POST' }),
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ['admin', 'report-snapshots'] })
        notifications.show({ color: 'teal', title: 'Snapshot diambil', message: 'Data hari ini tersimpan.' })
      } else {
        notifications.show({ color: 'red', title: 'Gagal', message: res.error ?? 'Unknown error' })
      }
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Stack gap={0}>
            <Text fw={500} size="sm">
              Riwayat Snapshot Harian
            </Text>
            <Text size="xs" c="dimmed">
              Data agregat per hari — dipakai AI untuk analisis tren. Klik baris untuk lihat detail.
            </Text>
          </Stack>
          <Group gap="xs">
            <Tooltip label="Refresh" withArrow>
              <ActionIcon variant="subtle" size="sm" onClick={() => refetch()} loading={isFetching}>
                <TbRefresh size={14} />
              </ActionIcon>
            </Tooltip>
            <Button
              size="xs"
              variant="light"
              color="blue"
              leftSection={capture.isPending ? <Loader size={12} /> : <TbCamera size={13} />}
              onClick={() => capture.mutate()}
              loading={capture.isPending}
            >
              Ambil Snapshot Sekarang
            </Button>
          </Group>
        </Group>

        {isLoading && (
          <Group justify="center" p="md">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Memuat riwayat...
            </Text>
          </Group>
        )}

        {!isLoading && snapshots.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Belum ada snapshot. Klik "Ambil Snapshot Sekarang" atau generate laporan pertama.
          </Text>
        )}

        {snapshots.length > 0 && (
          <Table.ScrollContainer minWidth={600}>
            <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 180 }}>Tanggal</Table.Th>
                  <Table.Th style={{ width: 90 }}>
                    <Tooltip label="Task berstatus OPEN / IN_PROGRESS / dll" withArrow>
                      <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Open</span>
                    </Tooltip>
                  </Table.Th>
                  <Table.Th style={{ width: 90 }}>
                    <Tooltip label="Task melewati due date" withArrow>
                      <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Overdue</span>
                    </Tooltip>
                  </Table.Th>
                  <Table.Th style={{ width: 100 }}>
                    <Tooltip label="Task closed dalam 7 hari terakhir" withArrow>
                      <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Velocity/7h</span>
                    </Tooltip>
                  </Table.Th>
                  <Table.Th style={{ width: 90 }}>
                    <Tooltip label="Task IN_PROGRESS tidak bergerak >3 hari" withArrow>
                      <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Stale</span>
                    </Tooltip>
                  </Table.Th>
                  <Table.Th style={{ width: 90 }}>Risk</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {snapshots.map((snap, i) => (
                  <SnapshotRow key={snap.id} snap={snap} prev={snapshots[i + 1]} />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  )
}
