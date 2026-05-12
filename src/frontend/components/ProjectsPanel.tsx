import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Kbd,
  Modal,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useHotkeys, useLocalStorage } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { Gantt, type GanttTask } from 'mantine-gantt'
import {
  TbAlertTriangle,
  TbArrowsSort,
  TbCalendarEvent,
  TbChecks,
  TbClock,
  TbFilterX,
  TbFlag,
  TbFolder,
  TbLayoutGrid,
  TbLayoutList,
  TbPencil,
  TbPlus,
  TbRefresh,
  TbSearch,
  TbTarget,
  TbUser,
  TbUsers,
  TbX,
} from 'react-icons/tb'
import { useSession } from '../hooks/useAuth'
import { notifyError, notifySuccess } from '../lib/notify'
import { UserAvatar } from './shared/UserAvatar'

export type MemberRole = 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ProjectUser {
  id: string
  name: string
  email: string
  image?: string | null
}

interface TaskStats {
  open: number
  inProgress: number
  readyForQc: number
  reopened: number
  closed: number
  total: number
}

export type ProjectVisibility = 'PRIVATE' | 'INTERNAL' | 'PUBLIC'

interface ProjectMember {
  id: string
  userId: string
  role: MemberRole
  joinedAt: string
  user: ProjectUser & { role: string }
}

export interface ProjectListItem {
  id: string
  name: string
  description: string | null
  ownerId: string
  status: ProjectStatus
  priority: ProjectPriority
  visibility: ProjectVisibility
  startsAt: string | null
  endsAt: string | null
  originalEndAt: string | null
  archivedAt: string | null
  githubRepo: string | null
  createdAt: string
  updatedAt: string
  owner: ProjectUser
  members: ProjectMember[]
  _count: { members: number; tasks: number; milestones: number }
  myRole: MemberRole | null
  canWrite: boolean
  joinedAt: string | null
  taskStats?: TaskStats
  milestoneStats?: { done: number; total: number }
}

export type ProjectDetail = ProjectListItem

interface ProjectMilestone {
  id: string
  projectId: string
  title: string
  description: string | null
  dueAt: string | null
  completedAt: string | null
  order: number
  createdAt: string
  updatedAt: string
}

const ROLE_COLOR: Record<MemberRole, string> = {
  OWNER: 'red',
  PM: 'violet',
  MEMBER: 'blue',
  VIEWER: 'gray',
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  DRAFT: 'gray',
  ACTIVE: 'blue',
  ON_HOLD: 'yellow',
  COMPLETED: 'green',
  CANCELLED: 'dark',
}

const STATUS_ACCENT: Record<ProjectStatus, string> = {
  DRAFT:     'rgba(134,142,150,0.35)',
  ACTIVE:    'rgba(34,139,230,0.45)',
  ON_HOLD:   'rgba(250,176,5,0.45)',
  COMPLETED: 'rgba(64,192,87,0.45)',
  CANCELLED: 'rgba(73,80,87,0.35)',
}
const OVERDUE_ACCENT = 'rgba(250,82,82,0.55)'

const STATUS_BG: Record<ProjectStatus, string> = {
  DRAFT:     'rgba(134,142,150,0.05)',
  ACTIVE:    'rgba(34,139,230,0.05)',
  ON_HOLD:   'rgba(250,176,5,0.05)',
  COMPLETED: 'rgba(64,192,87,0.05)',
  CANCELLED: 'rgba(73,80,87,0.04)',
}

const PRIORITY_COLOR: Record<ProjectPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const PRIORITY_OPTIONS: Array<{ value: ProjectPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
]

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000))
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function computeOverdue(p: ProjectListItem): { overdue: boolean; daysOver: number } {
  if (!p.endsAt) return { overdue: false, daysOver: 0 }
  if (p.status === 'COMPLETED' || p.status === 'CANCELLED') return { overdue: false, daysOver: 0 }
  const end = new Date(p.endsAt)
  const now = new Date()
  if (end.getTime() >= now.getTime()) return { overdue: false, daysOver: 0 }
  return { overdue: true, daysOver: daysBetween(end, now) }
}

function computeTimeProgress(p: ProjectListItem): number | null {
  if (!p.startsAt || !p.endsAt) return null
  const start = new Date(p.startsAt).getTime()
  const end = new Date(p.endsAt).getTime()
  const now = Date.now()
  if (end <= start) return null
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

function computeTaskProgress(p: ProjectListItem): number | null {
  if (!p.taskStats || p.taskStats.total === 0) return null
  return Math.round((p.taskStats.closed / p.taskStats.total) * 100)
}

type HealthLevel = 'on-track' | 'at-risk' | 'delayed'

function computeHealth(p: ProjectListItem): { level: HealthLevel; label: string; color: string } | null {
  if (p.status === 'COMPLETED' || p.status === 'CANCELLED' || p.status === 'DRAFT') return null
  const tp = computeTimeProgress(p)
  const xp = computeTaskProgress(p)
  if (tp === null || xp === null) return null
  const delta = xp - tp
  if (delta >= -10) return { level: 'on-track', label: 'On track', color: 'green' }
  if (delta >= -25) return { level: 'at-risk', label: 'At risk', color: 'yellow' }
  return { level: 'delayed', label: 'Delayed', color: 'red' }
}

type SortKey = 'updated' | 'created' | 'deadline' | 'priority' | 'progress' | 'name'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Recently created' },
  { value: 'deadline', label: 'Deadline (soonest)' },
  { value: 'priority', label: 'Priority (high→low)' },
  { value: 'progress', label: 'Progress (high→low)' },
  { value: 'name', label: 'Name (A→Z)' },
]

const ROLE_FILTER_OPTIONS: Array<{ value: MemberRole; label: string }> = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'PM', label: 'PM' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'VIEWER', label: 'Viewer' },
]

const PRIORITY_RANK: Record<ProjectPriority, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

// Status group order: active work first, then on-hold, draft, done, cancelled
const STATUS_GROUP_ORDER: ProjectStatus[] = ['ACTIVE', 'ON_HOLD', 'DRAFT', 'COMPLETED', 'CANCELLED']
const STATUS_GROUP_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: 'Aktif',
  ON_HOLD: 'Ditunda',
  DRAFT: 'Draft',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
}

function sortProjects(list: ProjectListItem[], key: SortKey): ProjectListItem[] {
  const out = [...list]
  switch (key) {
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name))
    case 'deadline':
      return out.sort((a, b) => {
        const ae = a.endsAt ? new Date(a.endsAt).getTime() : Number.POSITIVE_INFINITY
        const be = b.endsAt ? new Date(b.endsAt).getTime() : Number.POSITIVE_INFINITY
        return ae - be
      })
    case 'progress':
      return out.sort((a, b) => (computeTaskProgress(b) ?? -1) - (computeTaskProgress(a) ?? -1))
    case 'priority':
      return out.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])
    case 'created':
      return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    default:
      return out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }
}

export function ProjectsPanel() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const session = useSession()
  const role = session.data?.user?.role
  const canCreateProject = role === 'ADMIN' || role === 'SUPER_ADMIN'
  const [createOpen, setCreateOpen] = useState(false)
  const [scope, setScope] = useLocalStorage<'mine' | 'all'>({ key: 'pm:projects:scope', defaultValue: 'all' })
  const [statusFilter, setStatusFilter] = useLocalStorage<ProjectStatus | null>({
    key: 'pm:projects:statusFilter',
    defaultValue: null,
  })
  const [priorityFilter, setPriorityFilter] = useLocalStorage<ProjectPriority | null>({
    key: 'pm:projects:priorityFilter',
    defaultValue: null,
  })
  const [roleFilter, setRoleFilter] = useLocalStorage<MemberRole | null>({
    key: 'pm:projects:roleFilter',
    defaultValue: null,
  })
  const [ownerFilter, setOwnerFilter] = useLocalStorage<string | null>({
    key: 'pm:projects:ownerFilter',
    defaultValue: null,
  })
  const [userFilter, setUserFilter] = useLocalStorage<string | null>({
    key: 'pm:projects:userFilter',
    defaultValue: null,
  })
  const [derivedFilter, setDerivedFilter] = useState<'overdue' | 'atRisk' | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useLocalStorage<SortKey>({ key: 'pm:projects:sort', defaultValue: 'updated' })
  const [view, setView] = useLocalStorage<'grid' | 'list' | 'timeline'>({ key: 'pm:projects:view', defaultValue: 'grid' })
  const [groupByStatus, setGroupByStatus] = useLocalStorage<boolean>({ key: 'pm:projects:group-by-status', defaultValue: true })
  const [density, setDensity] = useLocalStorage<'comfortable' | 'compact'>({
    key: 'pm:projects:density',
    defaultValue: 'comfortable',
  })

  const openProject = (id: string, detailTab: 'overview' | 'settings' = 'overview') => {
    navigate({
      to: '/pm',
      search:
        detailTab === 'overview' ? { tab: 'projects', projectId: id } : { tab: 'projects', projectId: id, detailTab },
    })
  }

  const projectsQ = useQuery({
    queryKey: ['projects', scope],
    queryFn: () => api<{ projects: ProjectListItem[] }>(`/api/projects?scope=${scope}`),
  })

  const create = useMutation({
    mutationFn: (body: {
      name: string
      description?: string
      status?: ProjectStatus
      priority?: ProjectPriority
      startsAt?: string | null
      endsAt?: string | null
    }) =>
      api<{ project: ProjectListItem }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setCreateOpen(false)
      notifySuccess({ message: `Project "${res.project.name}" dibuat.` })
    },
    onError: (err) => notifyError(err),
  })

  const projects = projectsQ.data?.projects ?? []
  const statusCounts = useMemo(() => {
    const counts: Record<ProjectStatus, number> = {
      DRAFT: 0,
      ACTIVE: 0,
      ON_HOLD: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    }
    for (const p of projects) counts[p.status]++
    return counts
  }, [projects])

  const overdueCount = useMemo(() => projects.filter((p) => computeOverdue(p).overdue).length, [projects])
  const atRiskCount = useMemo(
    () =>
      projects.filter((p) => {
        const h = computeHealth(p)
        return h?.level === 'at-risk' || h?.level === 'delayed'
      }).length,
    [projects],
  )

  const filtered = useMemo(() => {
    let list = projects
    if (statusFilter) list = list.filter((p) => p.status === statusFilter)
    if (priorityFilter) list = list.filter((p) => p.priority === priorityFilter)
    if (roleFilter) list = list.filter((p) => p.myRole === roleFilter)
    if (ownerFilter) list = list.filter((p) => p.ownerId === ownerFilter)
    if (userFilter)
      list = list.filter((p) => p.ownerId === userFilter || p.members.some((m) => m.userId === userFilter))
    if (derivedFilter === 'overdue') {
      list = list.filter((p) => computeOverdue(p).overdue)
    } else if (derivedFilter === 'atRisk') {
      list = list.filter((p) => {
        const h = computeHealth(p)
        return h?.level === 'at-risk' || h?.level === 'delayed'
      })
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false))
    }
    return sortProjects(list, sort)
  }, [projects, statusFilter, priorityFilter, roleFilter, ownerFilter, userFilter, derivedFilter, search, sort])

  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of projects) {
      if (!seen.has(p.ownerId)) seen.set(p.ownerId, p.owner.name || p.owner.email || p.ownerId)
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [projects])

  const userOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of projects) {
      if (!seen.has(p.ownerId)) seen.set(p.ownerId, p.owner.name || p.owner.email || p.ownerId)
      for (const m of p.members) {
        if (!seen.has(m.userId)) seen.set(m.userId, m.user.name || m.user.email || m.userId)
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [projects])

  const hasActiveFilters = !!(
    statusFilter ||
    priorityFilter ||
    roleFilter ||
    ownerFilter ||
    userFilter ||
    derivedFilter ||
    search.trim()
  )
  const clearFilters = () => {
    setStatusFilter(null)
    setPriorityFilter(null)
    setRoleFilter(null)
    setOwnerFilter(null)
    setUserFilter(null)
    setDerivedFilter(null)
    setSearch('')
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 280px' }}>
          <Title order={3}>Projects</Title>
          <Text c="dimmed" size="sm">
            Projects you're a member of. Create one to start tracking tasks + AW activity.
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="sm"
            placeholder="Search name or description…"
            leftSection={<TbSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            rightSection={
              search ? (
                <ActionIcon variant="subtle" size="xs" color="gray" onClick={() => setSearch('')}>
                  <TbX size={12} />
                </ActionIcon>
              ) : null
            }
            w={260}
          />
          <Tooltip label="Refresh">
            <ActionIcon variant="light" size="lg" onClick={() => projectsQ.refetch()} loading={projectsQ.isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          {canCreateProject && (
            <Button leftSection={<TbPlus size={16} />} onClick={() => setCreateOpen(true)}>
              New Project
            </Button>
          )}
        </Group>
      </Group>

      {projects.length > 0 && (
        <Group gap="md" wrap="wrap" align="stretch">
          <Stack gap={4} style={{ minWidth: 110 }}>
            <Text size="10px" c="dimmed" tt="uppercase" fw={700}>
              Quick
            </Text>
            <PortfolioStat
              label="All"
              value={projects.length}
              color="blue"
              active={!hasActiveFilters}
              onClick={clearFilters}
            />
          </Stack>
          <Divider orientation="vertical" />
          <Stack gap={4} style={{ flex: 2, minWidth: 260 }}>
            <Group gap={6} align="baseline">
              <Text size="10px" c="dimmed" tt="uppercase" fw={700}>
                Status
              </Text>
              <Text size="10px" c="dimmed">
                (pick one)
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 3 }} spacing="xs">
              <PortfolioStat
                label="Active"
                value={statusCounts.ACTIVE}
                color="blue"
                active={statusFilter === 'ACTIVE'}
                onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? null : 'ACTIVE')}
              />
              <PortfolioStat
                label="On hold"
                value={statusCounts.ON_HOLD}
                color="yellow"
                active={statusFilter === 'ON_HOLD'}
                onClick={() => setStatusFilter(statusFilter === 'ON_HOLD' ? null : 'ON_HOLD')}
              />
              <PortfolioStat
                label="Completed"
                value={statusCounts.COMPLETED}
                color="green"
                active={statusFilter === 'COMPLETED'}
                onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? null : 'COMPLETED')}
              />
            </SimpleGrid>
          </Stack>
          <Divider orientation="vertical" />
          <Stack gap={4} style={{ flex: 1.5, minWidth: 200 }}>
            <Group gap={6} align="baseline">
              <Text size="10px" c="dimmed" tt="uppercase" fw={700}>
                Health
              </Text>
              <Text size="10px" c="dimmed">
                (pick one)
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 2 }} spacing="xs">
              <PortfolioStat
                label="Overdue"
                value={overdueCount}
                color="red"
                icon={<TbAlertTriangle size={14} />}
                active={derivedFilter === 'overdue'}
                muted={overdueCount === 0 && derivedFilter !== 'overdue'}
                onClick={
                  overdueCount > 0 ? () => setDerivedFilter(derivedFilter === 'overdue' ? null : 'overdue') : undefined
                }
              />
              <PortfolioStat
                label="At risk"
                value={atRiskCount}
                color="yellow"
                active={derivedFilter === 'atRisk'}
                muted={atRiskCount === 0 && derivedFilter !== 'atRisk'}
                onClick={
                  atRiskCount > 0 ? () => setDerivedFilter(derivedFilter === 'atRisk' ? null : 'atRisk') : undefined
                }
              />
            </SimpleGrid>
          </Stack>
        </Group>
      )}

      {projects.length > 0 && (
        <Card withBorder padding="sm" radius="md">
          <Stack gap="xs">
            <Group gap="xs" wrap="wrap" justify="flex-end">
              <SegmentedControl
                size="xs"
                value={scope}
                onChange={(v) => setScope(v as 'mine' | 'all')}
                data={[
                  { value: 'mine', label: 'Proyek saya' },
                  { value: 'all', label: 'Semua proyek' },
                ]}
              />
              {/* Status filter hidden temporarily */}
              <Select
                size="xs"
                w={140}
                placeholder="Any priority"
                value={priorityFilter}
                onChange={(v) => setPriorityFilter(v as ProjectPriority | null)}
                data={PRIORITY_OPTIONS}
                clearable
              />
              {/* Role filter hidden temporarily */}
              {/* Owner filter hidden temporarily */}
              <Select
                size="xs"
                w={180}
                placeholder="Any user"
                value={userFilter}
                onChange={setUserFilter}
                data={userOptions}
                leftSection={<TbUsers size={12} />}
                searchable
                clearable
                nothingFoundMessage="No users"
              />
              <Select
                size="xs"
                w={190}
                value={sort}
                onChange={(v) => v && setSort(v as SortKey)}
                data={SORT_OPTIONS}
                leftSection={<TbArrowsSort size={12} />}
                allowDeselect={false}
              />
              <SegmentedControl
                size="xs"
                value={density}
                onChange={(v) => setDensity(v as 'comfortable' | 'compact')}
                data={[
                  { value: 'comfortable', label: 'Comfy' },
                  { value: 'compact', label: 'Dense' },
                ]}
              />
              <Group gap={2}>
                <Tooltip label="Grid view">
                  <ActionIcon
                    size="sm"
                    variant={view === 'grid' ? 'filled' : 'subtle'}
                    color={view === 'grid' ? 'blue' : 'gray'}
                    onClick={() => setView('grid')}
                  >
                    <TbLayoutGrid size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="List view">
                  <ActionIcon
                    size="sm"
                    variant={view === 'list' ? 'filled' : 'subtle'}
                    color={view === 'list' ? 'blue' : 'gray'}
                    onClick={() => setView('list')}
                  >
                    <TbLayoutList size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Timeline">
                  <ActionIcon
                    size="sm"
                    variant={view === 'timeline' ? 'filled' : 'subtle'}
                    color={view === 'timeline' ? 'blue' : 'gray'}
                    onClick={() => setView('timeline')}
                  >
                    <TbCalendarEvent size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Tooltip label={groupByStatus ? 'Matikan pengelompokan' : 'Kelompokkan per status'}>
                <ActionIcon
                  size="sm"
                  variant={groupByStatus ? 'filled' : 'subtle'}
                  color={groupByStatus ? 'blue' : 'gray'}
                  onClick={() => setGroupByStatus(!groupByStatus)}
                >
                  <TbTarget size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {hasActiveFilters && (
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="dimmed">
                  Showing <b>{filtered.length}</b> of {projects.length}
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<TbFilterX size={12} />}
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </Group>
            )}
          </Stack>
        </Card>
      )}

      {filtered.length === 0 && !projectsQ.isLoading ? (
        <Card withBorder p="xl" radius="md">
          <Stack align="center" gap="sm">
            <TbFolder size={40} />
            <Text fw={500}>
              {projects.length === 0
                ? 'No projects yet'
                : hasActiveFilters
                  ? 'No projects match your filters'
                  : 'Nothing to show'}
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={360}>
              {projects.length === 0
                ? canCreateProject
                  ? 'Create your first project to start organizing tasks and tracking ActivityWatch focus.'
                  : 'You have not been added to any project yet. Ask an admin to invite you.'
                : hasActiveFilters
                  ? 'Try clearing filters or searching by a different keyword.'
                  : 'Pick a different view or create a new project.'}
            </Text>
            {projects.length === 0 && canCreateProject ? (
              <Button leftSection={<TbPlus size={16} />} onClick={() => setCreateOpen(true)}>
                Create Project
              </Button>
            ) : hasActiveFilters ? (
              <Button variant="light" leftSection={<TbFilterX size={16} />} onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </Stack>
        </Card>
      ) : view === 'timeline' ? (
        <ProjectsGanttView projects={filtered} onSelect={(p) => openProject(p.id)} />
      ) : (
        <ProjectsGrid filtered={filtered} view={view} density={density} groupByStatus={groupByStatus} canCreateProject={canCreateProject} openProject={openProject} />
      )}

      <CreateProjectModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(body) => create.mutate(body)}
        loading={create.isPending}
        error={create.error?.message}
      />
    </Stack>
  )
}

function PortfolioStat({
  label,
  value,
  color,
  icon,
  active,
  muted,
  onClick,
}: {
  label: string
  value: number
  color: string
  icon?: React.ReactNode
  active?: boolean
  muted?: boolean
  onClick?: () => void
}) {
  const clickable = !!onClick
  return (
    <Card
      withBorder
      padding="xs"
      radius="md"
      onClick={onClick}
      style={{
        cursor: clickable ? 'pointer' : 'default',
        borderColor: active ? `var(--mantine-color-${color}-outline)` : undefined,
        backgroundColor: active ? `var(--mantine-color-${color}-light)` : undefined,
        opacity: muted ? 0.55 : 1,
        transition: 'all 120ms ease',
      }}
    >
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ minWidth: 0 }} truncate>
          {icon ? <span style={{ marginRight: 4, verticalAlign: 'middle' }}>{icon}</span> : null}
          {label}
        </Text>
        <Text fw={700} size="lg" c={value > 0 ? color : 'dimmed'}>
          {value}
        </Text>
      </Group>
    </Card>
  )
}

function ProjectListRow({
  project: p,
  isSystemAdmin: isAdmin,
  onOpen,
  onEdit,
}: {
  project: ProjectListItem
  isSystemAdmin: boolean
  onOpen?: () => void
  onEdit: () => void
}) {
  const { overdue, daysOver } = computeOverdue(p)
  const canEdit = isAdmin || p.myRole === 'OWNER' || p.myRole === 'PM'
  const taskDone = p.taskStats && p.taskStats.total > 0
    ? Math.round((p.taskStats.closed / p.taskStats.total) * 100)
    : null
  const [hover, setHover] = useState(false)

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: onOpen ? 'pointer' : 'default',
        borderLeft: `3px solid ${overdue ? OVERDUE_ACCENT : STATUS_ACCENT[p.status]}`,
        transition: 'box-shadow 120ms ease',
        boxShadow: hover && onOpen ? '0 2px 8px rgba(0,0,0,0.06)' : undefined,
      }}
      onClick={onOpen}
    >
      <Group gap="sm" wrap="nowrap" justify="space-between">
        {/* Left: name + badges */}
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate style={{ minWidth: 0, flex: '0 1 auto', maxWidth: 260 }}>
            {p.name}
          </Text>
          <Group gap={4} wrap="nowrap" visibleFrom="sm">
            <Badge color={STATUS_COLOR[p.status]} variant="light" size="xs">
              {p.status.replace('_', ' ')}
            </Badge>
            <Badge color={PRIORITY_COLOR[p.priority]} variant="dot" size="xs">
              {p.priority}
            </Badge>
            {overdue && (
              <Badge color="red" variant="filled" size="xs">
                Overdue {daysOver}d
              </Badge>
            )}
          </Group>
        </Group>

        {/* Middle: progress + dates */}
        <Group gap="lg" wrap="nowrap" visibleFrom="md" style={{ flexShrink: 0 }}>
          {taskDone !== null && (
            <Group gap={6} wrap="nowrap">
              <Box style={{ width: 80 }}>
                <Progress value={taskDone} size="xs" color={taskDone === 100 ? 'green' : 'blue'} />
              </Box>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {taskDone}%
              </Text>
            </Group>
          )}
          {(p.startsAt || p.endsAt) && (
            <Group gap={4} wrap="nowrap">
              <TbCalendarEvent size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {formatDate(p.endsAt) ?? '—'}
              </Text>
            </Group>
          )}
          <Group gap={4} wrap="nowrap">
            <TbUsers size={12} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">{p._count.members}</Text>
          </Group>
          <Text size="xs" c="dimmed" truncate style={{ maxWidth: 120 }}>
            {p.owner.name}
          </Text>
        </Group>

        {/* Right: edit action */}
        {canEdit && (
          <Tooltip label="Edit project">
            <ActionIcon
              variant="subtle"
              size="sm"
              style={{ flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
            >
              <TbPencil size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Card>
  )
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE:    'var(--mantine-color-blue-5)',
  DRAFT:     'var(--mantine-color-gray-5)',
  ON_HOLD:   'var(--mantine-color-yellow-5)',
  COMPLETED: 'var(--mantine-color-green-5)',
  CANCELLED: 'var(--mantine-color-red-5)',
}

function ProjectCard({
  project: p,
  density,
  isSystemAdmin: isAdmin,
  onOpen,
  onEdit,
}: {
  project: ProjectListItem
  density: 'comfortable' | 'compact'
  isSystemAdmin: boolean
  onOpen?: () => void
  onEdit: () => void
}) {
  const { overdue, daysOver } = computeOverdue(p)
  const timeProgress = computeTimeProgress(p)
  const health = computeHealth(p)
  const extended = p.originalEndAt && p.endsAt && new Date(p.endsAt).getTime() !== new Date(p.originalEndAt).getTime()
  const canEdit = isAdmin || p.myRole === 'OWNER' || p.myRole === 'PM'
  const compact = density === 'compact'
  const [hover, setHover] = useState(false)

  const statusBg = overdue ? 'rgba(250,82,82,0.06)' : STATUS_BG[p.status]
  const pad = compact ? 'sm' : 'md'

  return (
    <Card
      withBorder
      padding={0}
      radius="md"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: onOpen ? 'pointer' : 'default',
        background: statusBg,
        transform: hover && onOpen ? 'translateY(-1px)' : undefined,
        boxShadow: hover && onOpen ? '0 4px 16px rgba(0,0,0,0.10)' : undefined,
        transition: 'all 120ms ease',
      }}
      onClick={onOpen}
    >
      {/* ── Header ── */}
      <Card.Section inheritPadding py={compact ? 'xs' : 'sm'} px={pad}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text fw={700} size={compact ? 'sm' : 'md'} lineClamp={1} style={{ flex: 1 }}>
            {p.name}
          </Text>
          {canEdit && (
            <Tooltip label="Edit project">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onEdit() }}
              >
                <TbPencil size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        <Group gap={4} wrap="wrap" mt={4}>
          <Badge variant="default" size="xs" style={{ border: 'none' }}>
            {p.status.replace('_', ' ')}
          </Badge>
          <Badge
            variant="default" size="xs" style={{ border: 'none' }}
            leftSection={<div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: `var(--mantine-color-${PRIORITY_COLOR[p.priority]}-6)`, flexShrink: 0 }} />}
          >
            {p.priority}
          </Badge>
          {p.myRole ? (
            <Badge variant="default" size="xs" style={{ border: 'none' }}>{p.myRole}</Badge>
          ) : isAdmin ? (
            <Badge variant="default" size="xs" style={{ border: 'none' }}>ADMIN VIEW</Badge>
          ) : (
            <Badge variant="default" size="xs" style={{ border: 'none' }}>READ-ONLY</Badge>
          )}
          {p.visibility === 'PRIVATE' && (
            <Badge variant="default" size="xs" style={{ border: 'none' }}>PRIVATE</Badge>
          )}
          {overdue && (
            <Badge variant="default" size="xs" style={{ border: 'none' }} leftSection={<TbAlertTriangle size={10} color="var(--mantine-color-red-6)" />}>
              Overdue {daysOver}d
            </Badge>
          )}
          {health && (
            <Tooltip label="Derived from task-completion pace vs. time elapsed">
              <Badge
                variant="default" size="xs" style={{ border: 'none' }}
                leftSection={<div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: `var(--mantine-color-${health.color}-6)`, flexShrink: 0 }} />}
              >
                {health.label.toUpperCase()}
              </Badge>
            </Tooltip>
          )}
          {extended && (
            <Tooltip label={`Original deadline: ${formatDate(p.originalEndAt)}`}>
              <Badge variant="default" size="xs" style={{ border: 'none' }}>Extended</Badge>
            </Tooltip>
          )}
        </Group>
      </Card.Section>

      {/* ── Body ── */}
      <Card.Section inheritPadding px={pad} pb={compact ? 'xs' : 'sm'}>
        {!compact && (
          <Text size="xs" c="dimmed" lineClamp={2} mb="xs">
            {p.description || 'No description'}
          </Text>
        )}

        {(p.startsAt || p.endsAt) && (
          <Group gap={4} mb={6}>
            <TbCalendarEvent size={12} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              {formatDate(p.startsAt)} → {formatDate(p.endsAt)}
            </Text>
          </Group>
        )}

        <Stack gap={6}>
          {timeProgress !== null && (
            <div>
              <Group justify="space-between" gap={4} mb={2}>
                <Text size="xs" c="dimmed">Timeline</Text>
                <Text size="xs" c={overdue ? 'red' : 'dimmed'}>{timeProgress}%</Text>
              </Group>
              <Progress value={timeProgress} size="xs" color={overdue ? 'red' : timeProgress > 80 ? 'orange' : 'indigo'} style={{ opacity: 0.7 }} />
            </div>
          )}

          {p.taskStats && p.taskStats.total > 0 && (
            <div>
              <Group justify="space-between" gap={4} mb={2}>
                <Group gap={4}>
                  <TbChecks size={12} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" c="dimmed">Tasks</Text>
                </Group>
                <Tooltip label={`${p.taskStats.closed} closed · ${p.taskStats.inProgress} in progress · ${p.taskStats.readyForQc} QC · ${p.taskStats.open + p.taskStats.reopened} open`}>
                  <Text size="xs" c="dimmed">
                    {p.taskStats.closed}/{p.taskStats.total} · {Math.round((p.taskStats.closed / p.taskStats.total) * 100)}%
                  </Text>
                </Tooltip>
              </Group>
              <Progress.Root size="xs" style={{ opacity: 0.7 }}>
                <Tooltip label={`Closed · ${p.taskStats.closed}`}>
                  <Progress.Section value={(p.taskStats.closed / p.taskStats.total) * 100} color="teal" />
                </Tooltip>
                <Tooltip label={`Ready for QC · ${p.taskStats.readyForQc}`}>
                  <Progress.Section value={(p.taskStats.readyForQc / p.taskStats.total) * 100} color="cyan" />
                </Tooltip>
                <Tooltip label={`In progress · ${p.taskStats.inProgress}`}>
                  <Progress.Section value={(p.taskStats.inProgress / p.taskStats.total) * 100} color="indigo" />
                </Tooltip>
                <Tooltip label={`Open / Reopened · ${p.taskStats.open + p.taskStats.reopened}`}>
                  <Progress.Section value={((p.taskStats.open + p.taskStats.reopened) / p.taskStats.total) * 100} color="gray" />
                </Tooltip>
              </Progress.Root>
            </div>
          )}

          {p.milestoneStats && p.milestoneStats.total > 0 && (
            <div>
              <Group justify="space-between" gap={4} mb={2}>
                <Group gap={4}>
                  <TbFlag size={12} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" c="dimmed">Milestones</Text>
                </Group>
                <Text size="xs" c="dimmed">{p.milestoneStats.done}/{p.milestoneStats.total}</Text>
              </Group>
              <Progress value={(p.milestoneStats.done / p.milestoneStats.total) * 100} size="xs" color="violet" style={{ opacity: 0.7 }} />
            </div>
          )}
        </Stack>
      </Card.Section>

      {/* ── Footer ── */}
      <Card.Section
        inheritPadding px={pad} py="xs"
        style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Avatar.Group spacing="sm">
            {p.members.slice(0, 4).map((m) => (
              <Tooltip key={m.userId} label={`${m.user.name} · ${m.role}`} withArrow>
                <UserAvatar name={m.user.name} image={m.user.image} size={22} color="blue" />
              </Tooltip>
            ))}
            {p.members.length > 4 && (
              <Tooltip label={`${p.members.length - 4} more members`} withArrow>
                <Avatar size={22} radius="xl" color="gray">+{p.members.length - 4}</Avatar>
              </Tooltip>
            )}
          </Avatar.Group>

          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <Tooltip label={`${p._count.tasks} tasks`}>
              <Group gap={3} wrap="nowrap">
                <TbFolder size={12} />
                <Text size="xs" c="dimmed">{p._count.tasks}</Text>
              </Group>
            </Tooltip>
            <Tooltip label={`Owner: ${p.owner.name}`}>
              <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                <UserAvatar name={p.owner.name} image={p.owner.image} size={18} color="blue" style={{ flexShrink: 0 }} />
                <Text size="xs" c="dimmed" truncate style={{ maxWidth: 90 }}>
                  {p.owner.name.split(' ')[0]}
                </Text>
              </Group>
            </Tooltip>
          </Group>
        </Group>
      </Card.Section>
    </Card>
  )
}

function CreateProjectModal({
  opened,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  opened: boolean
  onClose: () => void
  onSubmit: (body: {
    name: string
    description?: string
    status?: ProjectStatus
    priority?: ProjectPriority
    startsAt?: string | null
    endsAt?: string | null
  }) => void
  loading: boolean
  error?: string
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE')
  const [priority, setPriority] = useState<ProjectPriority>('MEDIUM')
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [endsAt, setEndsAt] = useState<Date | null>(null)

  const reset = () => {
    setName('')
    setDescription('')
    setStatus('ACTIVE')
    setPriority('MEDIUM')
    setStartsAt(null)
    setEndsAt(null)
  }

  const invalidRange = startsAt && endsAt && endsAt < startsAt
  const canSubmit = !!name.trim() && !invalidRange && !loading

  const durationDays =
    startsAt && endsAt && !invalidRange
      ? Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000))
      : null
  const durationLabel = durationDays
    ? durationDays >= 30
      ? `~${Math.round(durationDays / 30)} bulan`
      : durationDays >= 7
        ? `~${Math.round(durationDays / 7)} minggu`
        : `${durationDays} hari`
    : null

  const applyDurationPreset = (days: number) => {
    const start = startsAt ?? new Date()
    if (!startsAt) setStartsAt(start)
    const end = new Date(start)
    end.setDate(end.getDate() + days)
    setEndsAt(end)
  }

  const submit = () => {
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      startsAt: startsAt ? startsAt.toISOString() : null,
      endsAt: endsAt ? endsAt.toISOString() : null,
    })
  }

  useHotkeys(opened ? [['mod+Enter', submit]] : [])

  const descLimit = 280
  const descLen = description.length

  return (
    <Modal
      opened={opened}
      onClose={() => {
        reset()
        onClose()
      }}
      title={
        <Group gap="sm">
          <ThemeIcon variant="light" color="blue" size="lg" radius="md">
            <TbTarget size={18} />
          </ThemeIcon>
          <div>
            <Text fw={600} size="sm">
              Proyek Baru
            </Text>
            <Text size="xs" c="dimmed">
              Buat ruang kerja baru untuk tim kamu
            </Text>
          </div>
        </Group>
      }
      size="lg"
      centered
      overlayProps={{ blur: 3, opacity: 0.55 }}
      radius="md"
    >
      <Stack gap="lg">
        <Stack gap="xs">
          <SectionLabel>Info Dasar</SectionLabel>
          <TextInput
            label="Nama proyek"
            placeholder="mis. Redesign Website Acme"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            data-autofocus
            size="md"
          />
          <Textarea
            label="Deskripsi"
            placeholder="Tujuan utama, deliverable, atau konteks singkat"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value.slice(0, descLimit))}
            autosize
            minRows={2}
            maxRows={5}
            description={
              <Group gap={6} justify="flex-end">
                <Text size="xs" c={descLen > descLimit - 40 ? 'orange' : 'dimmed'}>
                  {descLen}/{descLimit}
                </Text>
              </Group>
            }
          />
        </Stack>

        <Stack gap="xs">
          <SectionLabel>Klasifikasi</SectionLabel>
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={500}>
              Status
            </Text>
            <Group gap={6} wrap="wrap">
              {STATUS_OPTIONS.map((o) => (
                <PillButton
                  key={o.value}
                  active={status === o.value}
                  color={STATUS_COLOR[o.value]}
                  onClick={() => setStatus(o.value)}
                >
                  {o.label}
                </PillButton>
              ))}
            </Group>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={500}>
              Prioritas
            </Text>
            <Group gap={6} wrap="wrap">
              {PRIORITY_OPTIONS.map((o) => (
                <PillButton
                  key={o.value}
                  active={priority === o.value}
                  color={PRIORITY_COLOR[o.value]}
                  onClick={() => setPriority(o.value)}
                >
                  {o.label}
                </PillButton>
              ))}
            </Group>
          </Stack>
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between" align="flex-end">
            <SectionLabel>Timeline</SectionLabel>
            {durationLabel && (
              <Badge variant="light" color="blue" leftSection={<TbClock size={10} />} size="sm">
                {durationLabel}
              </Badge>
            )}
          </Group>
          <Group grow>
            <DateInput highlightToday
              label="Mulai"
              placeholder="Opsional"
              value={startsAt}
              onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
              clearable
              leftSection={<TbClock size={14} />}
            />
            <DateInput highlightToday
              label="Selesai"
              placeholder="Opsional"
              value={endsAt}
              onChange={(v) => setEndsAt(v ? new Date(v as unknown as string) : null)}
              clearable
              leftSection={<TbCalendarEvent size={14} />}
              error={invalidRange ? 'Tanggal selesai harus setelah mulai' : undefined}
              minDate={startsAt ?? undefined}
            />
          </Group>
          <Group gap={6} wrap="wrap">
            <Text size="xs" c="dimmed">
              Cepat:
            </Text>
            {[
              { label: '1 minggu', days: 7 },
              { label: '2 minggu', days: 14 },
              { label: '1 bulan', days: 30 },
              { label: '3 bulan', days: 90 },
            ].map((p) => (
              <UnstyledButton
                key={p.days}
                onClick={() => applyDurationPreset(p.days)}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--mantine-color-default-border)',
                  color: 'var(--mantine-color-dimmed)',
                }}
              >
                {p.label}
              </UnstyledButton>
            ))}
          </Group>
        </Stack>

        {error && (
          <Alert color="red" variant="light" icon={<TbAlertTriangle size={16} />} radius="md">
            {error}
          </Alert>
        )}

        <Divider />

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Tekan <Kbd>⌘</Kbd> + <Kbd>Enter</Kbd> untuk menyimpan
          </Text>
          <Group gap="xs">
            <Button
              variant="subtle"
              onClick={() => {
                reset()
                onClose()
              }}
            >
              Batal
            </Button>
            <Button onClick={submit} disabled={!canSubmit} loading={loading} leftSection={<TbPlus size={16} />}>
              Buat Proyek
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: 0.6 }}>
      {children}
    </Text>
  )
}

function PillButton({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean
  color: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <UnstyledButton onClick={onClick}>
      <Box
        style={{
          padding: '4px 12px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 500,
          border: '1px solid',
          borderColor: active ? `var(--mantine-color-${color}-filled)` : 'var(--mantine-color-default-border)',
          backgroundColor: active ? `var(--mantine-color-${color}-filled)` : 'transparent',
          color: active ? 'var(--mantine-color-white)' : 'var(--mantine-color-text)',
          transition: 'all 0.15s',
          cursor: 'pointer',
        }}
      >
        {children}
      </Box>
    </UnstyledButton>
  )
}




function ProjectsGrid({
  filtered,
  view,
  density,
  groupByStatus,
  canCreateProject,
  openProject,
}: {
  filtered: ProjectListItem[]
  view: 'grid' | 'list' | 'timeline'
  density: 'comfortable' | 'compact'
  groupByStatus: boolean
  canCreateProject: boolean
  openProject: (id: string, tab?: 'overview' | 'settings') => void
}) {
  const renderItems = (items: ProjectListItem[]) =>
    view === 'list' ? (
      <Stack gap="xs">
        {items.map((p) => (
          <ProjectListRow key={p.id} project={p} isSystemAdmin={canCreateProject}
            onOpen={() => openProject(p.id)} onEdit={() => openProject(p.id, 'settings')} />
        ))}
      </Stack>
    ) : (
      <SimpleGrid cols={density === 'compact' ? { base: 1, sm: 2, md: 3, lg: 4 } : { base: 1, sm: 2, md: 3 }} spacing="md">
        {items.map((p) => (
          <ProjectCard key={p.id} project={p} density={density} isSystemAdmin={canCreateProject}
            onOpen={() => openProject(p.id)} onEdit={() => openProject(p.id, 'settings')} />
        ))}
      </SimpleGrid>
    )

  if (!groupByStatus) return renderItems(filtered)

  const groups = STATUS_GROUP_ORDER
    .map((status) => ({ status, items: filtered.filter((p) => p.status === status) }))
    .filter((g) => g.items.length > 0)

  return (
    <Stack gap="xl">
      {groups.map((g) => (
        <Stack key={g.status} gap="sm">
          <Group gap={8} align="center">
            <Box style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_ACCENT[g.status], flexShrink: 0 }} />
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
              {STATUS_GROUP_LABEL[g.status]}
            </Text>
            <Text size="xs" c="dimmed">· {g.items.length}</Text>
          </Group>
          {renderItems(g.items)}
        </Stack>
      ))}
    </Stack>
  )
}

// Muted status colors for project Gantt bars
const PROJECT_GANTT_COLOR: Record<ProjectStatus, string> = {
  DRAFT:     '#6c757d',
  ACTIVE:    '#4a7abf',
  ON_HOLD:   '#c49a28',
  COMPLETED: '#3a8f6a',
  CANCELLED: '#868e96',
}
const PROJECT_GANTT_OVERDUE = '#a84444'

type ProjViewMode = 'day' | 'week' | 'month'

const PROJ_COL_WIDTH: Record<ProjViewMode, number> = { day: 44, week: 28, month: 18 }
const PROJ_EFFECTIVE_DAY_PX: Record<ProjViewMode, number> = {
  day: 44,
  week: Math.max(28 / 2, 14),
  month: Math.max(18 / 6, 7),
}

const PROJ_VIEW_OPTIONS: Array<{ value: ProjViewMode; label: string }> = [
  { value: 'day', label: 'Hari' },
  { value: 'week', label: 'Minggu' },
  { value: 'month', label: 'Bulan' },
]

const ROW_H = 52
const HDR_H = 56

function ProjectsGanttView({
  projects,
  onSelect,
}: {
  projects: ProjectListItem[]
  onSelect: (p: ProjectListItem) => void
}) {
  const now = useMemo(() => new Date(), [])
  const withDates = useMemo(() => projects.filter((p) => p.startsAt && p.endsAt), [projects])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const isSyncingRef = useRef(false)
  const [viewMode, setViewMode] = useLocalStorage<ProjViewMode>({
    key: 'pm:projects:gantt-view',
    defaultValue: 'week',
  })

  const ganttTasks = useMemo<GanttTask[]>(() =>
    withDates.map((p) => {
      const start = new Date(p.startsAt as string)
      const end = new Date(p.endsAt as string)
      const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
      const isOverdue = end < now && p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
      const slipped = !!(p.originalEndAt && p.endsAt && p.originalEndAt !== p.endsAt)
      return {
        id: p.id,
        label: p.name,
        startDate: start.toISOString().slice(0, 10),
        duration,
        progress: computeTaskProgress(p) ?? 0,
        color: isOverdue ? PROJECT_GANTT_OVERDUE : slipped ? '#b86d2a' : PROJECT_GANTT_COLOR[p.status],
        dependencies: [],
      }
    }), [withDates, now])

  const { tlStart, tlEnd } = useMemo(() => {
    if (withDates.length === 0) return { tlStart: undefined, tlEnd: undefined }
    const allMs = withDates.flatMap((p) => [
      new Date(p.startsAt as string).getTime(),
      new Date(p.endsAt as string).getTime(),
    ])
    return {
      tlStart: new Date(Math.min(...allMs) - 14 * 86_400_000),
      tlEnd: new Date(Math.max(...allMs) + 14 * 86_400_000),
    }
  }, [withDates])

  const scrollToToday = useCallback(() => {
    if (!tlStart) return
    const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body) return
    const daysSinceStart = Math.floor((now.getTime() - tlStart.getTime()) / 86_400_000)
    const todayPx = daysSinceStart * PROJ_EFFECTIVE_DAY_PX[viewMode]
    body.scrollTo({ left: Math.max(0, todayPx - body.clientWidth / 2), behavior: 'smooth' })
  }, [tlStart, viewMode, now])

  // Auto-scroll on first render
  useEffect(() => {
    if (!tlStart) return
    let attempts = 0
    const tryScroll = () => {
      const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
      if (!body || body.scrollWidth <= body.clientWidth + 10) {
        if (++attempts < 30) setTimeout(tryScroll, 100)
        return
      }
      scrollToToday()
    }
    setTimeout(tryScroll, 100)
  }, [tlStart, viewMode, ganttTasks.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync vertical scroll: list ↔ gantt body
  const syncFromGantt = useCallback(() => {
    if (isSyncingRef.current) return
    const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body || !listRef.current) return
    isSyncingRef.current = true
    listRef.current.scrollTop = body.scrollTop
    isSyncingRef.current = false
  }, [])

  const syncFromList = useCallback(() => {
    if (isSyncingRef.current) return
    const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body || !listRef.current) return
    isSyncingRef.current = true
    body.scrollTop = listRef.current.scrollTop
    isSyncingRef.current = false
  }, [])

  if (withDates.length === 0) {
    return (
      <Card withBorder p="xl" radius="md">
        <Stack align="center" gap="xs">
          <TbCalendarEvent size={32} />
          <Text fw={500}>No projects with start + end dates</Text>
          <Text size="sm" c="dimmed">
            Add dates in a project's settings to see it on the timeline.
          </Text>
        </Stack>
      </Card>
    )
  }

  const totalH = Math.max(320, withDates.length * ROW_H + HDR_H + 8)

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        {/* Toolbar */}
        <Group justify="space-between">
          <Group gap="xs">
            <Text size="xs" c="dimmed">{withDates.length} proyek</Text>
            {projects.length > withDates.length && (
              <Tooltip label={`${projects.length - withDates.length} proyek tanpa tanggal tidak ditampilkan`} withArrow>
                <Badge size="xs" variant="default" style={{ border: 'none' }}>
                  +{projects.length - withDates.length} tanpa jadwal
                </Badge>
              </Tooltip>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Tooltip label="Scroll ke hari ini" withArrow>
              <ActionIcon variant="light" size="sm" color="red" onClick={scrollToToday}>
                <TbCalendarEvent size={14} />
              </ActionIcon>
            </Tooltip>
            <SegmentedControl
              size="xs"
              value={viewMode}
              onChange={(v) => setViewMode(v as ProjViewMode)}
              data={PROJ_VIEW_OPTIONS}
            />
          </Group>
        </Group>

        {/* Legend */}
        <Group gap={6} wrap="wrap">
          {(Object.entries(PROJECT_GANTT_COLOR) as [ProjectStatus, string][]).map(([status, color]) => (
            <Badge key={status} size="xs" variant="default" style={{ border: 'none' }}
              leftSection={<div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />}
            >
              {status.replace('_', ' ')}
            </Badge>
          ))}
          <Badge size="xs" variant="default" style={{ border: 'none' }}
            leftSection={<div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#b86d2a', flexShrink: 0 }} />}
          >Slipped</Badge>
          <Badge size="xs" variant="default" style={{ border: 'none' }}
            leftSection={<div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: PROJECT_GANTT_OVERDUE, flexShrink: 0 }} />}
          >Overdue</Badge>
        </Group>

        {/* Gantt + custom sidebar */}
        <div style={{ display: 'flex', height: totalH, border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden' }}>

          {/* Left sidebar — project names */}
          <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--mantine-color-default-border)' }}>
            {/* Header */}
            <div style={{ height: HDR_H, flexShrink: 0, borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', alignItems: 'flex-end', padding: '0 12px 8px' }}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>Proyek</Text>
            </div>
            {/* Rows */}
            <div ref={listRef} onScroll={syncFromList} style={{ flex: 1, overflowY: 'scroll', scrollbarWidth: 'none' }}>
              {withDates.map((p) => {
                const isOverdue = new Date(p.endsAt as string) < now && p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
                return (
                  <Tooltip key={p.id} label={`${p.status.replace('_',' ')} · ${p.priority}`} withArrow position="right">
                    <div
                      onClick={() => onSelect(p)}
                      style={{ height: ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, borderBottom: '1px solid var(--mantine-color-default-border)', cursor: 'pointer', overflow: 'hidden' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--mantine-color-default-hover)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '' }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: isOverdue ? PROJECT_GANTT_OVERDUE : PROJECT_GANTT_COLOR[p.status], flexShrink: 0 }} />
                      <Text size="xs" fw={500} truncate style={{ minWidth: 0, flex: 1 }} title={p.name}>{p.name}</Text>
                    </div>
                  </Tooltip>
                )
              })}
            </div>
          </div>

          {/* Gantt timeline */}
          <div ref={wrapperRef} style={{ flex: 1, overflow: 'hidden' }} onScroll={syncFromGantt}>
            <Gantt
              tasks={ganttTasks}
              viewMode={viewMode}
              startDate={tlStart}
              endDate={tlEnd}
              columnWidth={PROJ_COL_WIDTH[viewMode]}
              rowHeight={ROW_H}
              taskListWidth={0}
              showTodayMarker
              showTitle
              styles={{ taskList: { display: 'none' } }}
              onTaskClick={(t) => {
                const proj = projects.find((p) => p.id === t.id)
                if (proj) onSelect(proj)
              }}
            />
          </div>
        </div>
      </Stack>
    </Card>
  )
}

