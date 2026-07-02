import {
  ActionIcon,
  Badge,
  Card,
  Checkbox,
  Group,
  Pagination,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { TbArrowDown, TbArrowsSort, TbArrowUp, TbCopy } from 'react-icons/tb'
import { fmt, openInEditor, type SortDir, type SortKey } from './helpers'
import type { FileHealth } from './types'
import { PAGE_SIZE, STATUS_COLOR, STATUS_ICON, TYPE_COLOR, TYPE_LABEL } from './types'

type Props = {
  isLoading: boolean
  pageItems: FileHealth[]
  selected: Set<string>
  allPageSelected: boolean
  somePageSelected: boolean
  clipboardCopied: boolean
  onToggleRow: (path: string) => void
  onTogglePage: () => void
  onCopyOne: (f: FileHealth) => void
  totalPages: number
  safePage: number
  filteredLength: number
  onPageChange: (page: number) => void
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}

function SortableTh({
  label,
  sortValue,
  activeKey,
  dir,
  onSort,
  width,
  ta,
}: {
  label: string
  sortValue: SortKey
  activeKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  width?: number
  ta?: 'right'
}) {
  const active = activeKey === sortValue
  const Icon = active ? (dir === 'asc' ? TbArrowUp : TbArrowDown) : TbArrowsSort
  return (
    <Table.Th style={width ? { width } : undefined}>
      <UnstyledButton onClick={() => onSort(sortValue)} style={{ width: '100%' }}>
        <Group gap={4} wrap="nowrap" justify={ta === 'right' ? 'flex-end' : 'flex-start'}>
          <Text size="xs" fw={600} c={active ? undefined : 'dimmed'}>
            {label}
          </Text>
          <Icon size={12} opacity={active ? 1 : 0.4} />
        </Group>
      </UnstyledButton>
    </Table.Th>
  )
}

export function FileHealthTable({
  isLoading,
  pageItems,
  selected,
  allPageSelected,
  somePageSelected,
  clipboardCopied,
  onToggleRow,
  onTogglePage,
  onCopyOne,
  totalPages,
  safePage,
  filteredLength,
  onPageChange,
  sortKey,
  sortDir,
  onSort,
}: Props) {
  if (isLoading)
    return (
      <Text size="sm" c="dimmed">
        Memindai file...
      </Text>
    )

  return (
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
                    onChange={onTogglePage}
                  />
                </Tooltip>
              </Table.Th>
              <SortableTh label="File" sortValue="path" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <Table.Th style={{ width: 90 }}>Tipe</Table.Th>
              <SortableTh
                label="Baris"
                sortValue="lines"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                width={170}
              />
              <SortableTh
                label="Karakter"
                sortValue="chars"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                width={170}
              />
              <SortableTh label="%" sortValue="pct" activeKey={sortKey} dir={sortDir} onSort={onSort} width={70} />
              <SortableTh
                label="Status"
                sortValue="status"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                width={80}
              />
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
                  style={{ cursor: 'pointer', background: isSelected ? 'var(--mantine-color-blue-light)' : undefined }}
                  onDoubleClick={() => openInEditor(f.path)}
                  onClick={() => onToggleRow(f.path)}
                  title="Klik untuk pilih · Double-click untuk buka di editor"
                >
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Checkbox size="xs" checked={isSelected} onChange={() => onToggleRow(f.path)} />
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
                    <Tooltip label={clipboardCopied ? 'Tersalin!' : 'Copy path'} withArrow>
                      <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => onCopyOne(f)}>
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

      {totalPages > 1 && (
        <Group
          justify="space-between"
          align="center"
          px="md"
          py="xs"
          style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
        >
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(safePage * PAGE_SIZE, filteredLength)} dari{' '}
            {filteredLength} file
          </Text>
          <Pagination size="xs" total={totalPages} value={safePage} onChange={onPageChange} withEdges />
        </Group>
      )}
    </Card>
  )
}
