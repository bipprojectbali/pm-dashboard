import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { TbAlertTriangle, TbBriefcase, TbUser } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { priorityColor, projectStatusColor, roleBadgeColor, type ProjectLite, type TaskLite } from './types'

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap={2}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="xl" fw={700} c={color}>{value}</Text>
      </Stack>
    </Paper>
  )
}

export function ProfileSection({
  user,
}: {
  user: { name?: string; email?: string; role?: string; image?: string | null } | null | undefined
}) {
  const navigate = useNavigate()
  const { data: tasksData } = useQuery({
    queryKey: ['me', 'tasks'],
    queryFn: () =>
      fetch('/api/tasks?mine=1', { credentials: 'include' }).then((r) => r.json() as Promise<{ tasks: TaskLite[] }>),
  })
  const { data: projectsData } = useQuery({
    queryKey: ['me', 'projects'],
    queryFn: () =>
      fetch('/api/projects', { credentials: 'include' }).then((r) => r.json() as Promise<{ projects: ProjectLite[] }>),
  })

  const tasks = tasksData?.tasks ?? []
  const projects = projectsData?.projects ?? []
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000

  const openTasks = tasks.filter((t) => t.status !== 'CLOSED')
  const closedLast7 = tasks.filter((t) => t.closedAt && new Date(t.closedAt).getTime() >= weekAgo)
  const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now)
  const criticalTasks = openTasks.filter((t) => t.priority === 'CRITICAL' || t.priority === 'HIGH')

  return (
    <Stack gap="lg">
      <Paper withBorder p="xl" radius="md">
        <Stack align="center" gap="md">
          <UserAvatar name={user?.name} image={user?.image} size={80} color="blue" />
          <div style={{ textAlign: 'center' }}>
            <Text fw={600} size="lg">{user?.name}</Text>
            <Text c="dimmed" size="sm">{user?.email}</Text>
          </div>
          <Badge color={roleBadgeColor[user?.role ?? 'USER']} variant="light" size="lg">
            {user?.role}
          </Badge>
        </Stack>
      </Paper>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <StatCard label="Tugas aktif" value={openTasks.length} color="blue" />
        <StatCard label="Selesai 7 hari" value={closedLast7.length} color="teal" />
        <StatCard label="Terlambat" value={overdueTasks.length} color={overdueTasks.length > 0 ? 'red' : 'gray'} />
        <StatCard
          label="Prioritas tinggi"
          value={criticalTasks.length}
          color={criticalTasks.length > 0 ? 'orange' : 'gray'}
        />
      </SimpleGrid>

      {overdueTasks.length > 0 && (
        <Paper withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Group gap="xs">
              <ThemeIcon variant="light" color="red" size="md" radius="md">
                <TbAlertTriangle size={16} />
              </ThemeIcon>
              <Text fw={500} size="sm">Butuh perhatian segera ({overdueTasks.length})</Text>
            </Group>
            <Stack gap={6}>
              {overdueTasks.slice(0, 5).map((t) => {
                const daysLate = t.dueAt ? Math.max(1, Math.floor((now - new Date(t.dueAt).getTime()) / 86_400_000)) : 0
                return (
                  <Group
                    key={t.id}
                    justify="space-between"
                    wrap="nowrap"
                    gap="sm"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate({ to: '/pm', search: { tab: 'tasks' } })}
                  >
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Text size="sm" truncate>{t.title}</Text>
                      {t.project && (
                        <Text size="xs" c="dimmed" truncate>{t.project.name}</Text>
                      )}
                    </Stack>
                    <Badge size="xs" color="red" variant="light">{daysLate}h telat</Badge>
                  </Group>
                )
              })}
            </Stack>
          </Stack>
        </Paper>
      )}

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Group gap="xs">
              <ThemeIcon variant="light" color="violet" size="md" radius="md">
                <TbBriefcase size={16} />
              </ThemeIcon>
              <Text fw={500} size="sm">Proyek yang saya ikuti ({projects.length})</Text>
            </Group>
          </Group>
          {projects.length === 0 ? (
            <Text size="xs" c="dimmed">Belum terdaftar sebagai anggota proyek manapun.</Text>
          ) : (
            <Stack gap={6}>
              {projects.slice(0, 6).map((p) => (
                <Group
                  key={p.id}
                  justify="space-between"
                  wrap="nowrap"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate({ to: '/pm', search: { tab: 'projects' } })}
                >
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>{p.name}</Text>
                    <Group gap={6}>
                      <Badge size="xs" color={projectStatusColor[p.status] ?? 'gray'} variant="light">
                        {p.status}
                      </Badge>
                      {p.myRole && <Text size="xs" c="dimmed">{p.myRole}</Text>}
                    </Group>
                  </Stack>
                  <Badge size="xs" color={priorityColor[p.priority] ?? 'gray'} variant="light">
                    {p.priority}
                  </Badge>
                </Group>
              ))}
              {projects.length > 6 && (
                <Text size="xs" c="dimmed" ta="center">+{projects.length - 6} lainnya</Text>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <TbUser size={16} />
            <Text fw={500} size="sm">Informasi Akun</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Nama</Text>
            <Text size="sm">{user?.name}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Email</Text>
            <Text size="sm">{user?.email}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Peran</Text>
            <Text size="sm">{user?.role}</Text>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  )
}
