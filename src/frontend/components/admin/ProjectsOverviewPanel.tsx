import { ActionIcon, Badge, Card, Group, Select, SimpleGrid, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  TbAlertTriangle,
  TbCalendarEvent,
  TbCheck,
  TbClock,
  TbLayoutBoard,
  TbLayoutList,
  TbRefresh,
  TbSearch,
  TbTarget,
  TbUsers,
} from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import type { ProjectListItem } from '../ProjectsPanel'
import { ProjectsGanttView } from '../ProjectsPanel'
import { QcSelfProjectCard } from './QcSelfProjectCard'
import { type ViewMode, PAGE_SIZE, isOverdue } from './projectsoverviewpanel/constants'
import { ProjectsBoardView } from './projectsoverviewpanel/ProjectsBoardView'
import { ProjectsTableView } from './projectsoverviewpanel/ProjectsTableView'
import { StatCard } from './projectsoverviewpanel/StatCard'

export function ProjectsOverviewPanel() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)
  const [healthFilter, setHealthFilter] = useState<'all' | 'overdue' | 'extended'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [view, setView] = useLocalStorage<ViewMode>({ key: 'admin:projects:view', defaultValue: 'table' })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'projects-overview'],
    queryFn: () =>
      fetch('/api/projects', { credentials: 'include' }).then((r) => r.json()) as Promise<{
        projects: ProjectListItem[]
      }>,
  })

  const projects = data?.projects ?? []

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) map.set(p.owner.id, `${p.owner.name} (${p.owner.email})`)
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [projects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false
      if (priorityFilter && p.priority !== priorityFilter) return false
      if (ownerFilter && p.owner.id !== ownerFilter) return false
      if (healthFilter === 'overdue' && !isOverdue(p)) return false
      if (healthFilter === 'extended') {
        const extended =
          p.originalEndAt && p.endsAt && new Date(p.endsAt).getTime() !== new Date(p.originalEndAt).getTime()
        if (!extended) return false
      }
      if (q) {
        const hay = `${p.name} ${p.description ?? ''} ${p.owner.name} ${p.owner.email}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [projects, statusFilter, priorityFilter, ownerFilter, healthFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedFiltered = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
  useEffect(() => { setPage(1) }, [statusFilter, priorityFilter, ownerFilter, healthFilter, search])

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter((p) => p.status === 'ACTIVE').length,
    overdue: projects.filter(isOverdue).length,
    completed: projects.filter((p) => p.status === 'COMPLETED').length,
  }), [projects])

  const openProject = (id: string) => navigate({ to: '/pm', search: { tab: 'projects', projectId: id } })

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Group gap="xs">
            <Title order={3}>Projects Overview</Title>
            <InfoTip
              width={340}
              label="Daftar seluruh project di sistem (admin view). Berbeda dengan /pm yang hanya menampilkan project yang user-nya owner atau member. Klik baris untuk buka detail."
            />
          </Group>
          <Text size="sm" c="dimmed">Semua project lintas user. Klik baris untuk membuka detail.</Text>
        </div>
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" onClick={() => refetch()} loading={isFetching}>
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <QcSelfProjectCard />

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatCard label="Total" value={stats.total} icon={TbTarget} color="blue" tip="Jumlah seluruh project termasuk DRAFT / ACTIVE / ON_HOLD / COMPLETED / CANCELLED." />
        <StatCard label="Active" value={stats.active} icon={TbClock} color="teal" tip="Project dengan status ACTIVE (sedang dikerjakan). DRAFT = belum mulai, ON_HOLD = paused sementara." />
        <StatCard label="Overdue" value={stats.overdue} icon={TbAlertTriangle} color="red" tip="Project dengan endsAt < hari ini, status bukan COMPLETED/CANCELLED. Perlu ekstension deadline atau review scope." />
        <StatCard label="Completed" value={stats.completed} icon={TbCheck} color="green" tip="Project dengan status COMPLETED. Delivered dan closed." />
      </SimpleGrid>

      <Card withBorder padding="sm" radius="md">
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Cari nama, deskripsi, atau owner"
            leftSection={<TbSearch size={12} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="xs"
            w={280}
          />
          <Select placeholder="All statuses" data={['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']} value={statusFilter} onChange={setStatusFilter} clearable size="xs" w={160} />
          <Select placeholder="All priorities" data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} value={priorityFilter} onChange={setPriorityFilter} clearable size="xs" w={140} />
          <Select placeholder="All owners" data={ownerOptions} value={ownerFilter} onChange={setOwnerFilter} clearable searchable size="xs" w={240} leftSection={<TbUsers size={12} />} />
          <Tooltip multiline w={300} withArrow label="Filter kondisi project: Overdue = endsAt sudah lewat. Extended = endsAt sudah digeser dari originalEndAt (ada ProjectExtension). Semua status dihitung, tidak hanya ACTIVE.">
            <Select
              data={[{ value: 'all', label: 'All health' }, { value: 'overdue', label: 'Overdue' }, { value: 'extended', label: 'Extended' }]}
              value={healthFilter}
              onChange={(v) => setHealthFilter((v as 'all' | 'overdue' | 'extended') ?? 'all')}
              size="xs"
              w={140}
            />
          </Tooltip>
          <Badge variant="light" size="sm" ml="auto">{filtered.length} of {projects.length}</Badge>
          <Group gap={2}>
            <Tooltip label="Table" withArrow>
              <ActionIcon size="sm" variant={view === 'table' ? 'filled' : 'subtle'} color={view === 'table' ? 'blue' : 'gray'} onClick={() => setView('table')}>
                <TbLayoutList size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Board" withArrow>
              <ActionIcon size="sm" variant={view === 'board' ? 'filled' : 'subtle'} color={view === 'board' ? 'blue' : 'gray'} onClick={() => setView('board')}>
                <TbLayoutBoard size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Gantt" withArrow>
              <ActionIcon size="sm" variant={view === 'gantt' ? 'filled' : 'subtle'} color={view === 'gantt' ? 'blue' : 'gray'} onClick={() => setView('gantt')}>
                <TbCalendarEvent size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card>

      {view === 'gantt' && <ProjectsGanttView projects={filtered} onSelect={(p) => openProject(p.id)} />}
      {view === 'board' && <ProjectsBoardView projects={filtered} onSelect={(p) => openProject(p.id)} />}
      {view === 'table' && (
        <ProjectsTableView
          isLoading={isLoading}
          filtered={filtered}
          pagedFiltered={pagedFiltered}
          safePage={safePage}
          totalPages={totalPages}
          setPage={setPage}
          onSelect={openProject}
        />
      )}
    </Stack>
  )
}
