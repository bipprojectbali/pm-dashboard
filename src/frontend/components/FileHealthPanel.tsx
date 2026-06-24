import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Pagination,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { TbAlertTriangle, TbCircleCheck, TbCopy, TbFile, TbFileAlert, TbRefresh } from 'react-icons/tb'

type FileType = 'route-handler' | 'utility' | 'service' | 'test' | 'component' | 'frontend-route' | 'other'
type FileStatus = 'ok' | 'warning' | 'over'

interface FileHealth {
  path: string
  type: FileType
  lines: number
  chars: number
  limitLines: number
  limitChars: number
  pctLines: number
  pctChars: number
  pct: number
  status: FileStatus
}

interface Summary {
  total: number
  ok: number
  warning: number
  over: number
}

const TYPE_LABEL: Record<FileType, string> = {
  'route-handler': 'Route',
  utility: 'Utility',
  service: 'Service',
  test: 'Test',
  component: 'Component',
  'frontend-route': 'FE Route',
  other: 'Other',
}
const TYPE_COLOR: Record<FileType, string> = {
  'route-handler': 'blue',
  utility: 'teal',
  service: 'grape',
  test: 'gray',
  component: 'violet',
  'frontend-route': 'cyan',
  other: 'dark',
}
const STATUS_COLOR: Record<FileStatus, string> = { ok: 'teal', warning: 'yellow', over: 'red' }
const STATUS_ICON: Record<FileStatus, typeof TbCircleCheck> = {
  ok: TbCircleCheck,
  warning: TbAlertTriangle,
  over: TbFileAlert,
}

const PAGE_SIZE = 25

function openInEditor(relativePath: string) {
  fetch('/__open-in-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relativePath, lineNumber: '1', columnNumber: '1' }),
  }).catch(() => {})
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function buildCopyText(files: FileHealth[]): string {
  return files.map((f) => `${f.path}  (${f.lines} baris, ${f.pct}%)`).join('\n')
}

export function FileHealthPanel() {
  const clipboard = useClipboard({ timeout: 1500 })
  const [filter, setFilter] = useState<'all' | 'warning' | 'over'>('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // biome-ignore lint/correctness/useExhaustiveDependencies: setPage/setSelected stable
  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [filter])

  const q = useQuery<{ summary: Summary; files: FileHealth[] }>({
    queryKey: ['admin', 'file-health'],
    queryFn: () => fetch('/api/admin/file-health', { credentials: 'include' }).then((r) => r.json()),
  })

  const summary = q.data?.summary
  const filtered = useMemo(() => {
    const all = q.data?.files ?? []
    if (filter === 'over') return all.filter((f) => f.status === 'over')
    if (filter === 'warning') return all.filter((f) => f.status === 'warning' || f.status === 'over')
    return all
  }, [q.data, filter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageIds = pageItems.map((f) => f.path)

  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const somePageSelected = pageIds.some((id) => selected.has(id))

  const toggleRow = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected)
        pageIds.forEach((id) => {
          next.delete(id)
        })
      else
        pageIds.forEach((id) => {
          next.add(id)
        })
      return next
    })

  const selectedFiles = filtered.filter((f) => selected.has(f.path))

  const copyOne = (f: FileHealth) => clipboard.copy(`${f.path}  (${f.lines} baris, ${f.pct}%)`)
  const copySelected = () => clipboard.copy(buildCopyText(selectedFiles))
  const copyAll = () => clipboard.copy(buildCopyText(filtered))

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between" align="center">
        <div>
          <Text fw={700} size="lg">
            File Health
          </Text>
          <Text size="sm" c="dimmed">
            Ukuran file vs batas FILE_HEALTH.md. Double-click baris untuk buka di editor.
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label={clipboard.copied ? 'Tersalin!' : `Copy semua ${filtered.length} file`} withArrow>
            <Button
              size="xs"
              variant="light"
              color={clipboard.copied ? 'teal' : 'blue'}
              leftSection={<TbCopy size={13} />}
              onClick={copyAll}
              disabled={filtered.length === 0}
            >
              Copy semua ({filtered.length})
            </Button>
          </Tooltip>
          <Button
            size="xs"
            variant="subtle"
            leftSection={<TbRefresh size={13} />}
            onClick={() => q.refetch()}
            loading={q.isFetching}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {/* Summary cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Card withBorder p="sm" radius="md">
          <Group gap="xs" mb={4}>
            <ThemeIcon size="xs" variant="light" color="blue">
              <TbFile size={12} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">
              Total file
            </Text>
          </Group>
          <Text fw={700} size="xl">
            {summary?.total ?? '—'}
          </Text>
        </Card>
        <Card withBorder p="sm" radius="md" style={{ cursor: 'pointer' }} onClick={() => setFilter('all')}>
          <Group gap="xs" mb={4}>
            <ThemeIcon size="xs" variant="light" color="teal">
              <TbCircleCheck size={12} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">
              OK
            </Text>
          </Group>
          <Text fw={700} size="xl" c="teal">
            {summary?.ok ?? '—'}
          </Text>
        </Card>
        <Card
          withBorder
          p="sm"
          radius="md"
          style={{
            cursor: 'pointer',
            outline: filter === 'warning' ? '2px solid var(--mantine-color-yellow-5)' : undefined,
          }}
          onClick={() => setFilter('warning')}
        >
          <Group gap="xs" mb={4}>
            <ThemeIcon size="xs" variant="light" color="yellow">
              <TbAlertTriangle size={12} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">
              Warning (≥70%)
            </Text>
          </Group>
          <Text fw={700} size="xl" c="yellow">
            {summary?.warning ?? '—'}
          </Text>
        </Card>
        <Card
          withBorder
          p="sm"
          radius="md"
          style={{ cursor: 'pointer', outline: filter === 'over' ? '2px solid var(--mantine-color-red-5)' : undefined }}
          onClick={() => setFilter('over')}
        >
          <Group gap="xs" mb={4}>
            <ThemeIcon size="xs" variant="light" color="red">
              <TbFileAlert size={12} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">
              Over limit
            </Text>
          </Group>
          <Text fw={700} size="xl" c="red">
            {summary?.over ?? '—'}
          </Text>
        </Card>
      </SimpleGrid>

      {/* Filter + selection toolbar */}
      <Group gap="xs" justify="space-between">
        <Group gap="xs">
          {(['all', 'warning', 'over'] as const).map((f) => (
            <Button
              key={f}
              size="compact-xs"
              variant={filter === f ? 'filled' : 'light'}
              color={f === 'over' ? 'red' : f === 'warning' ? 'yellow' : 'blue'}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Semua' : f === 'warning' ? '≥70% limit' : 'Over limit'}
            </Button>
          ))}
        </Group>

        {/* Selection actions — muncul saat ada yang dipilih */}
        {selected.size > 0 && (
          <Group gap="xs">
            <Badge size="sm" color="blue" variant="light">
              {selected.size} dipilih
            </Badge>
            <Tooltip label={clipboard.copied ? 'Tersalin!' : `Copy ${selected.size} path`} withArrow>
              <Button
                size="compact-xs"
                variant="light"
                color={clipboard.copied ? 'teal' : 'blue'}
                leftSection={<TbCopy size={11} />}
                onClick={copySelected}
              >
                Copy terpilih
              </Button>
            </Tooltip>
            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setSelected(new Set())}>
              Batal pilih
            </Button>
          </Group>
        )}
      </Group>

      {/* Table */}
      {q.isLoading ? (
        <Text size="sm" c="dimmed">
          Memindai file...
        </Text>
      ) : (
        <Card withBorder radius="md" p={0}>
          <ScrollArea>
            <Table striped highlightOnHover withColumnBorders={false} verticalSpacing="xs" fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 36 }}>
                    <Tooltip label={allPageSelected ? 'Batal pilih halaman ini' : 'Pilih halaman ini'} withArrow>
                      <Checkbox
                        size="xs"
                        checked={allPageSelected}
                        indeterminate={!allPageSelected && somePageSelected}
                        onChange={togglePage}
                      />
                    </Tooltip>
                  </Table.Th>
                  <Table.Th>File</Table.Th>
                  <Table.Th style={{ width: 90 }}>Tipe</Table.Th>
                  <Table.Th style={{ width: 170 }}>Baris</Table.Th>
                  <Table.Th style={{ width: 170 }}>Karakter</Table.Th>
                  <Table.Th style={{ width: 70 }}>%</Table.Th>
                  <Table.Th style={{ width: 80 }}>Status</Table.Th>
                  <Table.Th style={{ width: 36 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pageItems.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Text size="sm" c="dimmed" ta="center" py="md">
                        Tidak ada file.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {pageItems.map((f) => {
                  const Icon = STATUS_ICON[f.status]
                  const statusColor = STATUS_COLOR[f.status]
                  const isSelected = selected.has(f.path)
                  return (
                    <Table.Tr
                      key={f.path}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
                      }}
                      onDoubleClick={() => openInEditor(f.path)}
                      onClick={() => toggleRow(f.path)}
                      title="Klik untuk pilih · Double-click untuk buka di editor"
                    >
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Checkbox size="xs" checked={isSelected} onChange={() => toggleRow(f.path)} />
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label={f.path} withArrow position="top-start">
                          <Text size="xs" ff="monospace" truncate maw={380}>
                            {f.path}
                          </Text>
                        </Tooltip>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" color={TYPE_COLOR[f.type]} variant="light">
                          {TYPE_LABEL[f.type]}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Group gap={4} justify="space-between">
                            <Text size="xs">{fmt(f.lines)}</Text>
                            <Text size="xs" c="dimmed">
                              / {fmt(f.limitLines)}
                            </Text>
                          </Group>
                          <Progress
                            value={Math.min(f.pctLines, 100)}
                            color={f.pctLines >= 100 ? 'red' : f.pctLines >= 70 ? 'yellow' : 'teal'}
                            size={4}
                            radius="xl"
                          />
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Group gap={4} justify="space-between">
                            <Text size="xs">{fmt(f.chars)}</Text>
                            <Text size="xs" c="dimmed">
                              / {fmt(f.limitChars)}
                            </Text>
                          </Group>
                          <Progress
                            value={Math.min(f.pctChars, 100)}
                            color={f.pctChars >= 100 ? 'red' : f.pctChars >= 70 ? 'yellow' : 'teal'}
                            size={4}
                            radius="xl"
                          />
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" fw={600} c={statusColor}>
                          {f.pct}%
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" color={statusColor} variant="light" leftSection={<Icon size={10} />}>
                          {f.status === 'ok' ? 'OK' : f.status === 'warning' ? 'Warning' : 'Over'}
                        </Badge>
                      </Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Tooltip label={clipboard.copied ? 'Tersalin!' : 'Copy path'} withArrow>
                          <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => copyOne(f)}>
                            <TbCopy size={11} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <Group
              justify="space-between"
              align="center"
              px="md"
              py="xs"
              style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
            >
              <Text size="xs" c="dimmed">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} dari{' '}
                {filtered.length} file
              </Text>
              <Pagination size="xs" total={totalPages} value={safePage} onChange={setPage} withEdges />
            </Group>
          )}
        </Card>
      )}
    </Stack>
  )
}
