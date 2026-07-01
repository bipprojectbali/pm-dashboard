import { ActionIcon, Card, Group, Pagination, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useEffect, useMemo, useState } from 'react'
import { TbInfoCircle, TbLayoutGrid, TbLayoutList, TbSearch } from 'react-icons/tb'
import { PHASE_STATUS_COLOR, PHASE_STATUS_ICON, PHASE_STATUS_LABEL, type PhaseStatus } from '../phase.types'
import { PhasePill, PhaseRow } from './PhaseBarPills'

type PhaseBarView = 'grid' | 'list'

const STATUSES: PhaseStatus[] = ['PLANNING', 'ACTIVE', 'COMPLETED']
const PAGE_SIZE = 12

const VIEW_OPTIONS: Array<{ value: PhaseBarView; label: string; Icon: typeof TbLayoutGrid }> = [
  { value: 'grid', label: 'Grid', Icon: TbLayoutGrid },
  { value: 'list', label: 'List', Icon: TbLayoutList },
]

function isPhaseStatus(s: string): s is PhaseStatus {
  return s === 'PLANNING' || s === 'ACTIVE' || s === 'COMPLETED'
}

interface Phase {
  id: string
  title: string
  status: string
  _count: { tasks: number }
}

export function TasksPhaseBar({
  phases,
  phaseFilter,
  onPhaseChange,
}: {
  phases: Phase[]
  phaseFilter: string | null
  onPhaseChange: (id: string | null) => void
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useLocalStorage<PhaseStatus | 'ALL'>({
    key: 'pm:tasks:phaseStatusFilter',
    defaultValue: 'ALL',
  })
  const [view, setView] = useLocalStorage<PhaseBarView>({
    key: 'pm:tasks:phaseBarView',
    defaultValue: 'grid',
  })

  const statusCounts = useMemo(
    () => ({
      PLANNING: phases.filter((p) => p.status === 'PLANNING').length,
      ACTIVE: phases.filter((p) => p.status === 'ACTIVE').length,
      COMPLETED: phases.filter((p) => p.status === 'COMPLETED').length,
    }),
    [phases],
  )

  // Search + status hanya menyaring pill fase (bukan pill "Semua"/"Tanpa Fase").
  const visiblePhases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return phases.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
      if (q && !p.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [phases, search, statusFilter])

  const [page, setPage] = useState(1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, view])

  const totalPages = Math.ceil(visiblePhases.length / PAGE_SIZE)
  const pageOffset = (page - 1) * PAGE_SIZE
  const pagedPhases = useMemo(
    () => visiblePhases.slice(pageOffset, pageOffset + PAGE_SIZE),
    [visiblePhases, pageOffset],
  )
  const noMatch = visiblePhases.length === 0 && (search.trim() !== '' || statusFilter !== 'ALL')

  if (phases.length === 0) return null

  return (
    <Card withBorder padding="xs" radius="md">
      <Stack gap={8}>
        <Group gap={6} wrap="wrap" align="center">
          <Group gap={4} align="center" mr={4}>
            <Text size="xs" fw={600} c="dimmed">
              Fase
            </Text>
            <Tooltip
              label={
                <Stack gap={4}>
                  <Text size="xs" fw={600}>
                    Apa itu Fase?
                  </Text>
                  <Text size="xs">
                    Fase adalah tahapan atau sprint dalam proyek — misalnya Planning, Development, Testing, Release.
                    Setiap task bisa dimasukkan ke satu fase agar lebih mudah dilacak per tahapan.
                  </Text>
                  <Text size="xs" fw={600} mt={2}>
                    Cara pakai filter ini
                  </Text>
                  <Text size="xs">• Klik fase untuk filter — klik lagi untuk reset</Text>
                  <Text size="xs">• Cari + filter status untuk menyaring daftar fase</Text>
                  <Text size="xs">• Angka di setiap pill = jumlah task dalam fase</Text>
                  <Text size="xs">• "Tanpa Fase" = task yang belum masuk fase manapun</Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    Kelola fase di tab Fase pada halaman detail proyek.
                  </Text>
                </Stack>
              }
              withArrow
              position="bottom-start"
              multiline
              w={300}
            >
              <TbInfoCircle size={12} style={{ color: 'var(--mantine-color-dimmed)', cursor: 'help' }} />
            </Tooltip>
          </Group>

          <TextInput
            size="xs"
            placeholder="Cari fase…"
            leftSection={<TbSearch size={12} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={160}
          />

          <Group gap={4} wrap="wrap">
            <PhasePill
              label="Semua status"
              active={statusFilter === 'ALL'}
              color="gray"
              onClick={() => setStatusFilter('ALL')}
            />
            {STATUSES.map((s) => {
              const Icon = PHASE_STATUS_ICON[s]
              return (
                <PhasePill
                  key={s}
                  label={PHASE_STATUS_LABEL[s]}
                  count={statusCounts[s]}
                  active={statusFilter === s}
                  color={PHASE_STATUS_COLOR[s]}
                  leftSection={<Icon size={11} />}
                  onClick={() => setStatusFilter(statusFilter === s ? 'ALL' : s)}
                />
              )
            })}
          </Group>

          <Group gap={4} ml="auto">
            {VIEW_OPTIONS.map(({ value, label, Icon }) => (
              <Tooltip key={value} label={label}>
                <ActionIcon
                  variant={view === value ? 'filled' : 'subtle'}
                  color="blue"
                  size="sm"
                  onClick={() => setView(value)}
                  aria-label={`Tampilan ${label}`}
                >
                  <Icon size={14} />
                </ActionIcon>
              </Tooltip>
            ))}
          </Group>
        </Group>

        {view === 'grid' ? (
          <Group gap={6} wrap="wrap" align="center">
            <PhasePill label="Semua" active={phaseFilter === null} color="blue" onClick={() => onPhaseChange(null)} />
            {pagedPhases.map((p) => {
              const Icon = isPhaseStatus(p.status) ? PHASE_STATUS_ICON[p.status] : null
              const color = isPhaseStatus(p.status) ? PHASE_STATUS_COLOR[p.status] : 'gray'
              return (
                <PhasePill
                  key={p.id}
                  label={p.title}
                  count={p._count.tasks}
                  active={phaseFilter === p.id}
                  color={color}
                  leftSection={Icon ? <Icon size={11} /> : undefined}
                  onClick={() => onPhaseChange(phaseFilter === p.id ? null : p.id)}
                />
              )
            })}
            {noMatch && (
              <Text size="xs" c="dimmed">
                Tidak ada fase yang cocok.
              </Text>
            )}
            <PhasePill
              label="Tanpa Fase"
              active={phaseFilter === 'none'}
              color="gray"
              onClick={() => onPhaseChange(phaseFilter === 'none' ? null : 'none')}
            />
          </Group>
        ) : (
          <Stack gap={4}>
            <PhaseRow title="Semua" active={phaseFilter === null} color="blue" onClick={() => onPhaseChange(null)} />
            {pagedPhases.map((p) => {
              const Icon = isPhaseStatus(p.status) ? PHASE_STATUS_ICON[p.status] : null
              const color = isPhaseStatus(p.status) ? PHASE_STATUS_COLOR[p.status] : 'gray'
              return (
                <PhaseRow
                  key={p.id}
                  title={p.title}
                  count={p._count.tasks}
                  active={phaseFilter === p.id}
                  color={color}
                  leftSection={Icon ? <Icon size={13} /> : undefined}
                  onClick={() => onPhaseChange(phaseFilter === p.id ? null : p.id)}
                />
              )
            })}
            {noMatch && (
              <Text size="xs" c="dimmed">
                Tidak ada fase yang cocok.
              </Text>
            )}
            <PhaseRow
              title="Tanpa Fase"
              active={phaseFilter === 'none'}
              color="gray"
              onClick={() => onPhaseChange(phaseFilter === 'none' ? null : 'none')}
            />
          </Stack>
        )}

        {totalPages > 1 && (
          <Group justify="space-between" align="center" mt={2}>
            <Text size="xs" c="dimmed">
              {pageOffset + 1}–{Math.min(pageOffset + PAGE_SIZE, visiblePhases.length)} dari {visiblePhases.length} fase
            </Text>
            <Pagination value={page} onChange={setPage} total={totalPages} size="xs" />
          </Group>
        )}
      </Stack>
    </Card>
  )
}
