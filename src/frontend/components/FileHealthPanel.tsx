import { Badge, Button, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { useClipboard, useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { TbCopy, TbRefresh, TbSearch } from 'react-icons/tb'
import { FileHealthSummaryCards } from './filehealthpanel/FileHealthSummaryCards'
import { FileHealthTable } from './filehealthpanel/FileHealthTable'
import { buildCopyText, filterFiles, type SortKey, sortFiles } from './filehealthpanel/helpers'
import type { FileHealth, Summary } from './filehealthpanel/types'
import { PAGE_SIZE } from './filehealthpanel/types'

type FilterValue = 'all' | 'warning' | 'over'

export function FileHealthPanel() {
  const clipboard = useClipboard({ timeout: 1500 })
  const [filter, setFilter] = useState<FilterValue>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search, 250)
  const [sortKey, setSortKey] = useState<SortKey>('pct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // biome-ignore lint/correctness/useExhaustiveDependencies: setPage/setSelected stable
  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [filter, debouncedSearch])

  const q = useQuery<{ summary: Summary; files: FileHealth[] }>({
    queryKey: ['admin', 'file-health'],
    queryFn: () => fetch('/api/admin/file-health', { credentials: 'include' }).then((r) => r.json()),
  })

  const summary = q.data?.summary
  const filtered = useMemo(() => {
    const matched = filterFiles(q.data?.files ?? [], filter, debouncedSearch)
    return sortFiles(matched, sortKey, sortDir)
  }, [q.data, filter, debouncedSearch, sortKey, sortDir])

  // Clicking a column header toggles direction, or switches to that column (desc default).
  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

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
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })

  const selectedFiles = filtered.filter((f) => selected.has(f.path))
  const copyOne = (f: FileHealth) => clipboard.copy(`${f.path}  (${f.lines} baris, ${f.pct}%)`)
  const copySelected = () => clipboard.copy(buildCopyText(selectedFiles))
  const copyAll = () => clipboard.copy(buildCopyText(filtered))

  return (
    <Stack gap="md">
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

      <FileHealthSummaryCards summary={summary} filter={filter} onFilterChange={setFilter} />

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
          <TextInput
            size="xs"
            placeholder="Cari path…"
            leftSection={<TbSearch size={13} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={220}
          />
        </Group>
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

      <FileHealthTable
        isLoading={q.isLoading}
        pageItems={pageItems}
        selected={selected}
        allPageSelected={allPageSelected}
        somePageSelected={somePageSelected}
        clipboardCopied={clipboard.copied}
        onToggleRow={toggleRow}
        onTogglePage={togglePage}
        onCopyOne={copyOne}
        totalPages={totalPages}
        safePage={safePage}
        filteredLength={filtered.length}
        onPageChange={setPage}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
    </Stack>
  )
}
