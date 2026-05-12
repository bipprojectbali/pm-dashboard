import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CopyButton,
  Group,
  Menu,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  TbAlertTriangle,
  TbArrowLeft,
  TbCalendarEvent,
  TbChecks,
  TbClock,
  TbCopy,
  TbDots,
  TbFlag,
  TbHistory,
  TbListCheck,
  TbRefresh,
  TbReport,
  TbSettings,
  TbTarget,
  TbUsers,
} from 'react-icons/tb'
import { useSession } from '../hooks/useAuth'
import { GithubActivityCard } from './GithubActivityCard'
import { ProjectSettingsTab } from './ProjectSettingsTab'
import { ExtensionsSection } from './ExtensionsSection'
import { MembersSection } from './MembersSection'
import { MilestonesSection } from './MilestonesSection'
import {
  type ProjectDetail,
  type ProjectListItem,
  type ProjectPriority,
  type ProjectStatus,
  type ProjectVisibility,
} from './ProjectsPanel'
import { RetroTab } from './RetroTab'
import { Breadcrumbs } from './shared/Breadcrumbs'
import { UserAvatar } from './shared/UserAvatar'
import { TasksPanel } from './TasksPanel'

export const PROJECT_DETAIL_TABS = [
  'overview',
  'tasks',
  'team',
  'milestones',
  'extensions',
  'retro',
  'settings',
] as const
export type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number]

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  DRAFT: 'gray',
  ACTIVE: 'blue',
  ON_HOLD: 'yellow',
  COMPLETED: 'green',
  CANCELLED: 'dark',
}

const PRIORITY_COLOR: Record<ProjectPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

const ROLE_COLOR: Record<string, string> = {
  OWNER: 'red',
  PM: 'violet',
  MEMBER: 'blue',
  VIEWER: 'gray',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function computeOverdue(p: Pick<ProjectListItem, 'endsAt' | 'status'>): { overdue: boolean; daysOver: number } {
  if (!p.endsAt) return { overdue: false, daysOver: 0 }
  if (p.status === 'COMPLETED' || p.status === 'CANCELLED') return { overdue: false, daysOver: 0 }
  const end = new Date(p.endsAt).getTime()
  const now = Date.now()
  if (end >= now) return { overdue: false, daysOver: 0 }
  return { overdue: true, daysOver: Math.round((now - end) / (24 * 3600 * 1000)) }
}

function computeTimeProgress(p: Pick<ProjectListItem, 'startsAt' | 'endsAt'>): number | null {
  if (!p.startsAt || !p.endsAt) return null
  const start = new Date(p.startsAt).getTime()
  const end = new Date(p.endsAt).getTime()
  const now = Date.now()
  if (end <= start) return null
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

function isSystemAdmin(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

function computeCanManage(myRole: string | null, systemRole: string | null | undefined): boolean {
  if (isSystemAdmin(systemRole)) return true
  return myRole === 'OWNER' || myRole === 'PM'
}

export function ProjectDetailView({
  projectId,
  tab,
  onTabChange,
  onBack,
  onDeleted,
}: {
  projectId: string
  tab: ProjectDetailTab
  onTabChange: (tab: ProjectDetailTab) => void
  onBack: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const session = useSession()
  const systemRole = session.data?.user?.role ?? null
  const detailQ = useQuery({
    queryKey: ['project', projectId],
    queryFn: () =>
      api<{ project: ProjectDetail; myRole: string | null; canWrite: boolean }>(`/api/projects/${projectId}`),
  })

  const project = detailQ.data?.project
  const canWrite = detailQ.data?.canWrite ?? false

  useHotkeys([['Escape', onBack]])

  const tabCounts = project?._count

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Tooltip label="Kembali ke daftar proyek (Esc)">
            <ActionIcon variant="subtle" size="lg" onClick={onBack} aria-label="Back">
              <TbArrowLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <Breadcrumbs
            items={[{ label: 'Projects', onClick: onBack }, { label: project?.name ?? projectId.slice(0, 8) }]}
          />
          {project && (
            <CopyButton value={project.id} timeout={1500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'ID disalin' : 'Salin project ID'}>
                  <ActionIcon variant="subtle" size="sm" onClick={copy} color={copied ? 'teal' : 'gray'}>
                    {copied ? <TbChecks size={14} /> : <TbCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          )}
        </Group>
        <Group gap="xs">
          {detailQ.isFetching && !detailQ.isLoading && (
            <Badge variant="dot" color="blue" size="sm">
              Sinkronisasi…
            </Badge>
          )}
          <Tooltip label="Refresh data">
            <ActionIcon variant="light" size="lg" onClick={() => detailQ.refetch()} loading={detailQ.isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {detailQ.isLoading ? (
        <Stack gap="md">
          <Card withBorder padding="md" radius="md">
            <Group gap="sm" align="flex-start">
              <Skeleton height={48} width={48} radius="md" />
              <Stack gap={6} style={{ flex: 1 }}>
                <Skeleton height={24} width="40%" />
                <Group gap={6}>
                  <Skeleton height={18} width={60} radius="xl" />
                  <Skeleton height={18} width={70} radius="xl" />
                  <Skeleton height={18} width={50} radius="xl" />
                </Group>
                <Skeleton height={14} width="80%" />
              </Stack>
            </Group>
          </Card>
          <Group gap="xs">
            {PROJECT_DETAIL_TABS.map((t) => (
              <Skeleton key={t} height={34} width={110} radius="sm" />
            ))}
          </Group>
          <Card withBorder padding="md" radius="md">
            <Stack gap="sm">
              <Skeleton height={18} width="30%" />
              <Skeleton height={120} />
              <Skeleton height={80} />
            </Stack>
          </Card>
        </Stack>
      ) : detailQ.error ? (
        <Alert color="red" icon={<TbAlertTriangle size={18} />} title="Gagal memuat proyek" radius="md">
          <Stack gap="sm">
            <Text size="sm">{(detailQ.error as Error).message}</Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() => detailQ.refetch()}
                leftSection={<TbRefresh size={14} />}
              >
                Coba lagi
              </Button>
              <Button size="xs" variant="subtle" onClick={onBack}>
                Kembali
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : !project ? (
        <Alert color="yellow" icon={<TbAlertTriangle size={18} />} radius="md">
          Proyek tidak ditemukan atau kamu tidak punya akses.
        </Alert>
      ) : (
        <>
          <ProjectHeader project={project} systemRole={systemRole} canWrite={canWrite} />

          <Tabs value={tab} onChange={(v) => v && onTabChange(v as ProjectDetailTab)} keepMounted={false} variant="pills">
            {/* Primary tabs + secondary overflow menu */}
            <Group gap={4} mb="md" wrap="nowrap" align="center">
              <Tabs.List style={{ gap: 4, flexWrap: 'nowrap' }}>
                <Tabs.Tab value="overview" leftSection={<TbTarget size={14} />}>
                  Overview
                </Tabs.Tab>
                <Tabs.Tab value="tasks" leftSection={<TbListCheck size={14} />} rightSection={<TabCount value={tabCounts?.tasks} />}>
                  Tasks
                </Tabs.Tab>
                <Tabs.Tab value="team" leftSection={<TbUsers size={14} />} rightSection={<TabCount value={tabCounts?.members} />}>
                  Team
                </Tabs.Tab>
                <Tabs.Tab value="milestones" leftSection={<TbFlag size={14} />} rightSection={<TabCount value={tabCounts?.milestones} />}>
                  Milestones
                </Tabs.Tab>
              </Tabs.List>

              {/* Secondary tabs — overflow menu */}
              <Menu shadow="md" radius="md" position="bottom-end">
                <Menu.Target>
                  <ActionIcon
                    variant={['extensions', 'retro', 'settings'].includes(tab) ? 'filled' : 'subtle'}
                    color={['extensions', 'retro', 'settings'].includes(tab) ? 'blue' : 'gray'}
                    size="sm"
                    radius="md"
                  >
                    <TbDots size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Lainnya</Menu.Label>
                  <Menu.Item
                    leftSection={<TbHistory size={14} />}
                    onClick={() => onTabChange('extensions')}
                    style={{ fontWeight: tab === 'extensions' ? 700 : undefined }}
                  >
                    Extensions
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<TbReport size={14} />}
                    onClick={() => onTabChange('retro')}
                    style={{ fontWeight: tab === 'retro' ? 700 : undefined }}
                  >
                    Retro
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<TbSettings size={14} />}
                    onClick={() => onTabChange('settings')}
                    style={{ fontWeight: tab === 'settings' ? 700 : undefined }}
                    color="dimmed"
                  >
                    Settings
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>

              {/* Active secondary tab indicator */}
              {(['extensions', 'retro', 'settings'] as const).includes(tab as 'extensions' | 'retro' | 'settings') && (
                <Box
                  px="sm"
                  py={4}
                  style={{
                    borderRadius: 'var(--mantine-radius-md)',
                    background: 'var(--mantine-color-blue-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--mantine-color-blue-filled)',
                  }}
                >
                  {tab === 'extensions' && <TbHistory size={13} />}
                  {tab === 'retro' && <TbReport size={13} />}
                  {tab === 'settings' && <TbSettings size={13} />}
                  {tab === 'extensions' ? 'Extensions' : tab === 'retro' ? 'Retro' : 'Settings'}
                </Box>
              )}
            </Group>

            <Tabs.Panel value="overview" pt="md">
              <OverviewTab project={project} onOpenTasks={() => onTabChange('tasks')} />
            </Tabs.Panel>
            <Tabs.Panel value="tasks" pt="md">
              <TasksPanel projectId={project.id} canWriteOverride={canWrite} />
            </Tabs.Panel>
            <Tabs.Panel value="team" pt="md">
              <MembersSection
                projectId={project.id}
                myRole={project.myRole}
                systemRole={systemRole}
                ownerId={project.ownerId}
              />
            </Tabs.Panel>
            <Tabs.Panel value="milestones" pt="md">
              <MilestonesSection projectId={project.id} canManage={computeCanManage(project.myRole, systemRole)} />
            </Tabs.Panel>
            <Tabs.Panel value="extensions" pt="md">
              <ExtensionsSection
                projectId={project.id}
                currentEndAt={project.endsAt}
                startsAt={project.startsAt}
                canExtend={computeCanManage(project.myRole, systemRole)}
              />
            </Tabs.Panel>
            <Tabs.Panel value="retro" pt="md">
              <RetroTab projectId={project.id} />
            </Tabs.Panel>
            <Tabs.Panel value="settings" pt="md">
              <ProjectSettingsTab
                project={project}
                systemRole={systemRole}
                onDeleted={() => {
                  qc.invalidateQueries({ queryKey: ['projects'] })
                  qc.invalidateQueries({ queryKey: ['milestones', 'all'] })
                  onDeleted()
                }}
              />
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Stack>
  )
}

function TabCount({ value }: { value?: number }) {
  if (value === undefined) return null
  return (
    <Badge size="xs" variant="light" color="gray" circle>
      {value}
    </Badge>
  )
}

function ProjectHeader({
  project,
  systemRole,
  canWrite,
}: {
  project: ProjectDetail
  systemRole: string | null
  canWrite: boolean
}) {
  const { overdue, daysOver } = computeOverdue(project)
  const extended =
    project.originalEndAt &&
    project.endsAt &&
    new Date(project.endsAt).getTime() !== new Date(project.originalEndAt).getTime()

  return (
    <Stack gap="xs">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon variant="light" color={STATUS_COLOR[project.status]} size="xl" radius="md">
          <TbTarget size={22} />
        </ThemeIcon>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Title order={2} style={{ lineHeight: 1.2 }}>
            {project.name}
          </Title>
          <Group gap={6} wrap="wrap">
            <Badge color={STATUS_COLOR[project.status]} variant="light" size="sm">
              {project.status.replace('_', ' ')}
            </Badge>
            <Badge color={PRIORITY_COLOR[project.priority]} variant="dot" size="sm">
              {project.priority}
            </Badge>
            {project.myRole ? (
              <Badge color={ROLE_COLOR[project.myRole] ?? 'gray'} variant="light" size="sm">
                {project.myRole}
              </Badge>
            ) : isSystemAdmin(systemRole) ? (
              <Badge color="gray" variant="outline" size="sm">
                ADMIN VIEW
              </Badge>
            ) : null}
            {overdue && (
              <Badge color="red" variant="filled" size="sm" leftSection={<TbAlertTriangle size={10} />}>
                Overdue {daysOver}d
              </Badge>
            )}
            {extended && (
              <Tooltip label={`Original deadline: ${formatDate(project.originalEndAt)}`}>
                <Badge color="grape" variant="light" size="sm">
                  Extended
                </Badge>
              </Tooltip>
            )}
            {project.visibility === 'PRIVATE' && (
              <Tooltip label="Proyek privat — hanya anggota yang dapat mengakses">
                <Badge color="dark" variant="filled" size="sm">
                  Private
                </Badge>
              </Tooltip>
            )}
            {project.visibility === 'PUBLIC' && (
              <Badge color="cyan" variant="light" size="sm">
                Public
              </Badge>
            )}
            {!canWrite && (
              <Tooltip label="Kamu bukan anggota proyek ini — hanya bisa melihat">
                <Badge color="gray" variant="outline" size="sm">
                  Read-only
                </Badge>
              </Tooltip>
            )}
          </Group>
          {project.description && (
            <Text size="sm" c="dimmed">
              {project.description}
            </Text>
          )}
        </Stack>
      </Group>
    </Stack>
  )
}

function OverviewTab({ project, onOpenTasks }: { project: ProjectDetail; onOpenTasks: () => void }) {
  const timeProgress = computeTimeProgress(project)
  const { overdue } = computeOverdue(project)
  const ts = project.taskStats
  const ms = project.milestoneStats

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <StatMini label="Members" value={String(project._count.members)} icon={TbUsers} color="blue" />
        <StatMini
          label="Tasks"
          value={`${ts?.closed ?? 0}/${ts?.total ?? project._count.tasks}`}
          icon={TbListCheck}
          color="orange"
        />
        <StatMini
          label="Milestones"
          value={`${ms?.done ?? 0}/${ms?.total ?? project._count.milestones}`}
          icon={TbFlag}
          color="grape"
        />
        <StatMini
          label="Timeline"
          value={timeProgress !== null ? `${timeProgress}%` : '—'}
          icon={TbClock}
          color={overdue ? 'red' : 'teal'}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder padding="md" radius="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Dates
              </Text>
              <Text size="xs" c="dimmed">
                Start → End
              </Text>
            </Group>
            <Group gap={6}>
              <TbCalendarEvent size={14} />
              <Text size="sm">
                {formatDate(project.startsAt)} → {formatDate(project.endsAt)}
              </Text>
            </Group>
            {project.originalEndAt && (
              <Text size="xs" c="dimmed">
                Original deadline: {formatDate(project.originalEndAt)}
              </Text>
            )}
            {timeProgress !== null && (
              <div>
                <Group justify="space-between" gap={4}>
                  <Text size="xs" c="dimmed">
                    Time elapsed
                  </Text>
                  <Text size="xs" c={overdue ? 'red' : 'dimmed'}>
                    {timeProgress}%
                  </Text>
                </Group>
                <Progress
                  value={timeProgress}
                  size="sm"
                  mt={4}
                  color={overdue ? 'red' : timeProgress > 80 ? 'orange' : 'blue'}
                />
              </div>
            )}
          </Stack>
        </Card>

        <Card withBorder padding="md" radius="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Task progress
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={onOpenTasks}>
                Open tasks
              </Button>
            </Group>
            {ts && ts.total > 0 ? (
              <>
                <Group justify="space-between" gap={4}>
                  <Group gap={4}>
                    <TbChecks size={14} />
                    <Text size="xs" c="dimmed">
                      {ts.closed} closed · {ts.inProgress} in progress · {ts.readyForQc} QC · {ts.open + ts.reopened}{' '}
                      open
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {Math.round((ts.closed / ts.total) * 100)}%
                  </Text>
                </Group>
                <Progress.Root size="sm" mt={4}>
                  <Progress.Section value={(ts.closed / ts.total) * 100} color="green" />
                  <Progress.Section value={(ts.readyForQc / ts.total) * 100} color="teal" />
                  <Progress.Section value={(ts.inProgress / ts.total) * 100} color="blue" />
                  <Progress.Section value={((ts.open + ts.reopened) / ts.total) * 100} color="gray" />
                </Progress.Root>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                No tasks yet.
              </Text>
            )}
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder padding="md" radius="md">
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Team
          </Text>
          {project.members.length === 0 ? (
            <Text size="sm" c="dimmed">
              No members yet.
            </Text>
          ) : (
            <Stack gap={6}>
              {project.members.map((m) => (
                <Group key={m.id} justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <UserAvatar name={m.user.name} image={m.user.image} size={26} color="blue" style={{ flexShrink: 0 }} />
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>{m.user.name}</Text>
                      <Text size="xs" c="dimmed" truncate>{m.user.email}</Text>
                    </Stack>
                  </Group>
                  <Badge color={ROLE_COLOR[m.role] ?? 'gray'} variant="light" size="sm">
                    {m.role}
                  </Badge>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <GithubActivityCard project={project} />
    </Stack>
  )
}

function StatMini({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  icon: typeof TbTarget
  color: string
}) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed" fw={500} tt="uppercase">
            {label}
          </Text>
          <Text fw={700} size="xl">
            {value}
          </Text>
        </div>
        <ThemeIcon variant="light" color={color} size="lg" radius="md">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
    </Card>
  )
}
