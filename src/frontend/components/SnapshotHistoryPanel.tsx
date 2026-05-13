import { ActionIcon, Badge, Button, Card, Divider, Group, Loader, Stack, Table, Text, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCamera, TbChevronDown, TbChevronUp, TbRefresh, TbTrendingDown, TbTrendingUp } from 'react-icons/tb'
import { notifications } from '@mantine/notifications'
import type { DailySnapshotData, SnapshotProject, SnapshotTeamMember } from '../../lib/daily-snapshot'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string }
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

function fmtDate(date: Date | string) {
  const d = new Date(date)
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  return wib.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function DeltaBadge({ now, prev }: { now: number; prev: number }) {
  const d = now - prev
  if (d === 0) return <Text size="xs" c="dimmed">±0</Text>
  return (
    <Group gap={2} wrap="nowrap">
      {d > 0 ? <TbTrendingUp size={11} color="var(--mantine-color-red-5)" /> : <TbTrendingDown size={11} color="var(--mantine-color-teal-5)" />}
      <Text size="xs" c={d > 0 ? 'red' : 'teal'} fw={600}>{d > 0 ? '+' : ''}{d}</Text>
    </Group>
  )
}

function SnapshotRow({ snap, prev }: { snap: DailySnapshotData; prev?: DailySnapshotData }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <Table.Tr
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Table.Td>
          <Group gap={6} wrap="nowrap">
            {expanded ? <TbChevronUp size={12} /> : <TbChevronDown size={12} />}
            <Text size="xs" fw={500}>{fmtDate(snap.date)}</Text>
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Text size="xs">{snap.kpi.openTasks}</Text>
            {prev && <DeltaBadge now={snap.kpi.openTasks} prev={prev.kpi.openTasks} />}
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Text size="xs">{snap.kpi.overdueCount}</Text>
            {prev && <DeltaBadge now={snap.kpi.overdueCount} prev={prev.kpi.overdueCount} />}
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Text size="xs">{snap.kpi.velocity7d}</Text>
            {prev && <DeltaBadge now={snap.kpi.velocity7d} prev={prev.kpi.velocity7d} />}
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Text size="xs">{snap.kpi.staleCount}</Text>
            {prev && <DeltaBadge now={snap.kpi.staleCount} prev={prev.kpi.staleCount} />}
          </Group>
        </Table.Td>
        <Table.Td>
          <Badge
            size="xs"
            color={snap.risks.severity === 'high' ? 'red' : snap.risks.severity === 'medium' ? 'orange' : snap.risks.severity === 'low' ? 'yellow' : 'green'}
            variant="light"
          >
            {snap.risks.severity}
          </Badge>
        </Table.Td>
      </Table.Tr>

      {expanded && (
        <Table.Tr>
          <Table.Td colSpan={6} style={{ background: 'var(--mantine-color-default-hover)', padding: '12px 16px' }}>
            <Group align="flex-start" gap="xl" wrap="wrap">
              {/* Projects */}
              <Stack gap={4} style={{ minWidth: 280, flex: 1 }}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Projects ({snap.projects.length})</Text>
                {snap.projects.length === 0 && <Text size="xs" c="dimmed">—</Text>}
                {snap.projects.map((p) => {
                  const prevP = prev?.projects.find((pp) => pp.id === p.id)
                  return (
                    <Group key={p.id} gap={6} wrap="nowrap">
                      <Badge size="xs" variant="light" color={p.pastDue ? 'red' : 'blue'}>{p.grade}</Badge>
                      <Text size="xs" fw={500} truncate style={{ maxWidth: 160 }}>{p.name}</Text>
                      <Text size="xs" c="dimmed">{p.score}/100</Text>
                      {prevP && <DeltaBadge now={p.score} prev={prevP.score} />}
                      {p.overdueTasks > 0 && <Badge size="xs" color="red" variant="dot">{p.overdueTasks} OD</Badge>}
                      {p.blockedTasks > 0 && <Badge size="xs" color="orange" variant="dot">{p.blockedTasks} BL</Badge>}
                    </Group>
                  )
                })}
              </Stack>

              <Divider orientation="vertical" />

              {/* Team */}
              <Stack gap={4} style={{ minWidth: 260, flex: 1 }}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Tim ({snap.team.length})</Text>
                {snap.team.length === 0 && <Text size="xs" c="dimmed">—</Text>}
                {snap.team.map((u) => {
                  const prevU = prev?.team.find((pu) => pu.userId === u.userId)
                  return (
                    <Group key={u.userId} gap={6} wrap="nowrap">
                      <Text size="xs" fw={500} style={{ minWidth: 90 }} truncate>{u.name}</Text>
                      <Text size="xs" c="dimmed">{u.open} open</Text>
                      <Text size="xs" c={u.overdue > 0 ? 'red' : 'dimmed'}>{u.overdue} OD</Text>
                      <Text size="xs" c="teal">{u.closed7d}✓</Text>
                      {prevU && <DeltaBadge now={u.open} prev={prevU.open} />}
                      {u.overloaded && <Badge size="xs" color="red" variant="filled">OL</Badge>}
                    </Group>
                  )
                })}
              </Stack>
            </Group>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  )
}

export function SnapshotHistoryPanel() {
  const qc = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'report-snapshots'],
    queryFn: () => apiFetch<{ snapshots: DailySnapshotData[] }>('/api/admin/report/snapshots?days=30'),
    staleTime: 5 * 60_000,
  })

  const snapshots = (data?.snapshots ?? []).slice().reverse() // newest first

  const capture = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; error?: string }>('/api/admin/report/snapshots/capture', { method: 'POST' }),
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
            <Text fw={500} size="sm">Riwayat Snapshot Harian</Text>
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
            <Text size="sm" c="dimmed">Memuat riwayat...</Text>
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
                    <Tooltip label="Task berstatus OPEN / IN_PROGRESS / dll" withArrow><span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Open</span></Tooltip>
                  </Table.Th>
                  <Table.Th style={{ width: 90 }}>
                    <Tooltip label="Task melewati due date" withArrow><span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Overdue</span></Tooltip>
                  </Table.Th>
                  <Table.Th style={{ width: 100 }}>
                    <Tooltip label="Task closed dalam 7 hari terakhir" withArrow><span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Velocity/7h</span></Tooltip>
                  </Table.Th>
                  <Table.Th style={{ width: 90 }}>
                    <Tooltip label="Task IN_PROGRESS tidak bergerak >3 hari" withArrow><span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Stale</span></Tooltip>
                  </Table.Th>
                  <Table.Th style={{ width: 90 }}>Risk</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {snapshots.map((snap, i) => (
                  <SnapshotRow
                    key={snap.id}
                    snap={snap}
                    prev={snapshots[i + 1]}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  )
}
