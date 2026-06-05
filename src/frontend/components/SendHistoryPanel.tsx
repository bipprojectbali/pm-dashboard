import {
  ActionIcon,
  Badge,
  Button,
  Card,
  CopyButton,
  Drawer,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck, TbCopy, TbEye, TbRefresh, TbSend } from 'react-icons/tb'
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
  const [preview, setPreview] = useState<SendHistoryEntry | null>(null)

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
    <>
      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Stack gap={0}>
              <Text fw={500} size="sm">
                Riwayat Pengiriman Laporan
              </Text>
              <Text size="xs" c="dimmed">
                20 pengiriman terakhir — klik baris untuk preview konten laporan.
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
                    <Table.Th style={{ width: 70 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {history.map((entry) => (
                    <Table.Tr
                      key={entry.sentAt}
                      style={{ cursor: entry.markdown ? 'pointer' : 'default' }}
                      onClick={() => entry.markdown && setPreview(entry)}
                    >
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
                        <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                          {entry.markdown && (
                            <Tooltip label="Preview konten laporan" withArrow>
                              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setPreview(entry)}>
                                <TbEye size={13} />
                              </ActionIcon>
                            </Tooltip>
                          )}
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
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      </Card>

      {/* Preview Drawer */}
      <Drawer
        opened={!!preview}
        onClose={() => setPreview(null)}
        title={
          preview ? (
            <Stack gap={2}>
              <Text fw={600} size="sm">
                Preview Laporan
              </Text>
              <Group gap={6}>
                <Text size="xs" c="dimmed">
                  {fmtTs(preview.sentAt)}
                </Text>
                <Badge size="xs" variant="light" color={TRIGGER_COLOR[preview.trigger] ?? 'gray'}>
                  {TRIGGER_LABEL[preview.trigger] ?? preview.trigger}
                </Badge>
                <Badge size="xs" variant="light" color={preview.ok ? 'teal' : 'red'}>
                  {preview.ok ? 'OK' : 'Gagal'}
                </Badge>
              </Group>
            </Stack>
          ) : null
        }
        position="right"
        size="xl"
        padding="md"
      >
        {preview?.markdown && (
          <Stack gap="sm" h="100%">
            <Group justify="flex-end">
              <CopyButton value={preview.markdown} timeout={2000}>
                {({ copied, copy }) => (
                  <Button
                    size="xs"
                    variant="light"
                    color={copied ? 'teal' : 'blue'}
                    leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                    onClick={copy}
                  >
                    {copied ? 'Tersalin!' : 'Copy markdown'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Textarea
              value={preview.markdown}
              readOnly
              autosize
              minRows={20}
              maxRows={40}
              styles={{ input: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 } }}
            />
          </Stack>
        )}
      </Drawer>
    </>
  )
}
