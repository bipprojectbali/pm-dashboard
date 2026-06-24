import {
  ActionIcon,
  Badge,
  Button,
  Card,
  CopyButton,
  Drawer,
  Group,
  Loader,
  Pagination,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
  Tooltip,
  TypographyStylesProvider,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck, TbCopy, TbEye, TbRefresh, TbSend, TbTrash } from 'react-icons/tb'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReportHistoryRange } from '../../lib/report-history'

type SendTrigger = 'cron' | 'manual' | 'custom'

interface HistoryEntry {
  id: string
  sentAt: string
  ok: boolean
  message: string
  trigger: SendTrigger
  markdown?: string | null
}

interface HistoryResponse {
  history: HistoryEntry[]
  total: number
  page: number
  limit: number
  range: ReportHistoryRange
}

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

const RANGE_OPTS: { value: ReportHistoryRange; label: string }[] = [
  { value: '1m', label: '1 Bulan' },
  { value: '3m', label: '3 Bulan' },
  { value: 'all', label: 'Semua' },
]

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type PreviewMode = 'normal' | 'markdown'

interface PreviewDrawerProps {
  entry: HistoryEntry | null
  onClose: () => void
}

function PreviewDrawer({ entry, onClose }: PreviewDrawerProps) {
  const [mode, setMode] = useState<PreviewMode>('normal')
  return (
    <Drawer
      opened={!!entry}
      onClose={onClose}
      title={
        entry ? (
          <Stack gap={2}>
            <Text fw={600} size="sm">
              Preview Laporan
            </Text>
            <Group gap={6}>
              <Text size="xs" c="dimmed">
                {entry ? fmtTs(entry.sentAt) : ''}
              </Text>
              <Badge size="xs" variant="light" color={TRIGGER_COLOR[entry.trigger] ?? 'gray'}>
                {TRIGGER_LABEL[entry.trigger] ?? entry.trigger}
              </Badge>
              <Badge size="xs" variant="light" color={entry.ok ? 'teal' : 'red'}>
                {entry.ok ? 'OK' : 'Gagal'}
              </Badge>
            </Group>
          </Stack>
        ) : null
      }
      position="right"
      size="xl"
      padding="md"
    >
      {entry?.markdown && (
        <Stack gap="sm" style={{ height: '100%' }}>
          <Group justify="space-between">
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => setMode(v as PreviewMode)}
              data={[
                { value: 'normal', label: 'Normal' },
                { value: 'markdown', label: 'Markdown' },
              ]}
            />
            <CopyButton value={entry.markdown} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  size="xs"
                  variant="light"
                  color={copied ? 'teal' : 'blue'}
                  leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                  onClick={copy}
                >
                  {copied ? 'Tersalin!' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>

          {mode === 'normal' ? (
            <ScrollArea style={{ flex: 1 }} type="auto">
              <TypographyStylesProvider>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.markdown}</ReactMarkdown>
              </TypographyStylesProvider>
            </ScrollArea>
          ) : (
            <Textarea
              value={entry.markdown}
              readOnly
              autosize
              minRows={20}
              maxRows={50}
              styles={{ input: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 } }}
            />
          )}
        </Stack>
      )}
    </Drawer>
  )
}

export function ReportHistoryPanel({ showDelete }: { showDelete?: boolean }) {
  const qc = useQueryClient()
  const [range, setRange] = useState<ReportHistoryRange>('1m')
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState<HistoryEntry | null>(null)

  const q = useQuery<HistoryResponse>({
    queryKey: ['admin', 'report-send-history', range, page],
    queryFn: () => apiFetch<HistoryResponse>(`/api/admin/report/send-history?page=${page}&limit=20&range=${range}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const sendNow = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/send-now', { method: 'POST' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'report-send-history'] })
      notifications.show({ color: res.ok ? 'teal' : 'red', title: res.ok ? 'Terkirim' : 'Gagal', message: res.message })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/api/admin/report/history/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'report-send-history'] })
      notifications.show({ color: 'teal', title: 'Dihapus', message: 'Entri riwayat dihapus.' })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const confirmDelete = (entry: HistoryEntry) =>
    modals.openConfirmModal({
      title: 'Hapus riwayat ini?',
      children: <Text size="sm">Laporan {fmtTs(entry.sentAt)} akan dihapus permanen dari database.</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteEntry.mutate(entry.id),
    })

  const entries = q.data?.history ?? []
  const total = q.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  const handleRangeChange = (v: string) => {
    setRange(v as ReportHistoryRange)
    setPage(1)
  }

  return (
    <>
      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={0}>
              <Text fw={500} size="sm">
                Riwayat Pengiriman Laporan
              </Text>
              <Text size="xs" c="dimmed">
                Klik baris untuk preview. {total > 0 && `${total} entri total.`}
              </Text>
            </Stack>
            <Group gap="xs">
              <SegmentedControl
                size="xs"
                value={range}
                onChange={handleRangeChange}
                data={RANGE_OPTS.map((o) => ({ value: o.value, label: o.label }))}
              />
              <Tooltip label="Refresh" withArrow>
                <ActionIcon variant="subtle" size="sm" onClick={() => q.refetch()} loading={q.isFetching}>
                  <TbRefresh size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {q.isLoading && (
            <Group justify="center" p="md">
              <Loader size="sm" />
            </Group>
          )}

          {!q.isLoading && entries.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              Belum ada riwayat pengiriman pada periode ini.
            </Text>
          )}

          {entries.length > 0 && (
            <Table.ScrollContainer minWidth={500}>
              <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 220 }}>Waktu Kirim</Table.Th>
                    <Table.Th style={{ width: 90 }}>Trigger</Table.Th>
                    <Table.Th style={{ width: 80 }}>Status</Table.Th>
                    <Table.Th>Pesan</Table.Th>
                    <Table.Th style={{ width: showDelete ? 100 : 70 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {entries.map((entry) => (
                    <Table.Tr
                      key={entry.id}
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
                            <Tooltip label="Preview laporan" withArrow>
                              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setPreview(entry)}>
                                <TbEye size={13} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          <Tooltip label="Kirim ulang laporan" withArrow>
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
                          {showDelete && (
                            <Tooltip label="Hapus entri ini" withArrow>
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="red"
                                loading={deleteEntry.isPending && deleteEntry.variables === entry.id}
                                onClick={() => confirmDelete(entry)}
                              >
                                <TbTrash size={13} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

          {totalPages > 1 && (
            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed">
                {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} dari {total} entri
              </Text>
              <Pagination size="xs" total={totalPages} value={page} onChange={setPage} withEdges />
            </Group>
          )}
        </Stack>
      </Card>

      <PreviewDrawer entry={preview} onClose={() => setPreview(null)} />
    </>
  )
}
