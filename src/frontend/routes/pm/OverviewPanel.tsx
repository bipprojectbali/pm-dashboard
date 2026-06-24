import {
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { IconType } from 'react-icons'
import {
  TbActivity,
  TbAlertTriangle,
  TbBell,
  TbBug,
  TbCalendarDue,
  TbCalendarEvent,
  TbCircleCheck,
  TbClockHour4,
  TbGhost2,
  TbListCheck,
  TbMessage,
  TbPlus,
  TbSparkles,
  TbTarget,
  TbUserPlus,
} from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { buildClosedTrendOption, buildDueBarOption, buildStatusDonutOption } from './chartBuilders'
import { ChartMini } from './ChartMini'
import { formatRelativeTime } from './helpers'
import { MiniStat } from './MiniStat'
import { SectionCard } from './SectionCard'
import { StatCard } from './StatCard'
import { TaskRow } from './TaskRow'
import type { OverviewNotification, OverviewTask } from './types'
import { useOverviewData } from './useOverviewData'

const NOTIF_ICON: Record<OverviewNotification['kind'], IconType> = {
  TASK_ASSIGNED: TbUserPlus,
  TASK_COMMENTED: TbMessage,
  TASK_STATUS_CHANGED: TbActivity,
  TASK_DUE_SOON: TbCalendarDue,
  TASK_OVERDUE: TbAlertTriangle,
  TASK_MENTIONED: TbMessage,
}

const NOTIF_COLOR: Record<OverviewNotification['kind'], string> = {
  TASK_ASSIGNED: 'blue',
  TASK_COMMENTED: 'grape',
  TASK_STATUS_CHANGED: 'teal',
  TASK_DUE_SOON: 'orange',
  TASK_OVERDUE: 'red',
  TASK_MENTIONED: 'violet',
}

export function OverviewPanel({
  userName,
  onGoToTasks,
  onGoToProjects,
}: {
  userName: string
  onGoToTasks: () => void
  onGoToProjects: () => void
}) {
  const navigate = useNavigate()
  const {
    myTasksQ,
    notifsQ,
    upcomingEventsQ,
    activeProjects,
    openTasks,
    openBugs,
    myTasks,
    activeMine,
    overdue,
    dueSoon,
    ghost,
    closedThisWeek,
    bugsAssignedThisWeek,
    inProgressCount,
    notifs,
    eventsToday,
    eventsThisWeek,
    now,
  } = useOverviewData()

  const openTask = (t: OverviewTask) => {
    navigate({ to: '/pm', search: { tab: 'tasks', taskId: t.id, ...(t.projectId ? { projectId: t.projectId } : {}) } })
  }

  const statusDonutOption = useMemo(() => buildStatusDonutOption(activeMine), [activeMine])
  const closedTrendOption = useMemo(() => buildClosedTrendOption(myTasks), [myTasks])
  const dueBarOption = useMemo(() => buildDueBarOption(activeMine, now), [activeMine, now])

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Halo, {userName.split(' ')[0]}</Title>
        <Text c="dimmed" size="sm">
          Ringkasan proyek kamu. Mulai proyek, pantau task, dan lihat pipeline bergerak.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <StatCard label="Proyek Aktif" value={String(activeProjects.length)} icon={TbTarget} color="blue"
          tip="Proyek dengan status ACTIVE — belum ARCHIVED/COMPLETED. Termasuk proyek yang kamu miliki atau jadi member di dalamnya." />
        <StatCard label="Task Terbuka" value={String(openTasks.length)} icon={TbListCheck} color="orange"
          tip="Task dengan status OPEN, IN_PROGRESS, READY_FOR_QC, atau REOPENED di semua proyek yang kamu lihat. CLOSED tidak dihitung." />
        <StatCard label="Bug Terbuka" value={String(openBugs)} icon={TbBug} color="red"
          tip="Subset Task Terbuka dengan kind=BUG. Prioritaskan ini — bug aktif berdampak ke user." />
        <StatCard label="Ditugaskan ke Saya" value={String(activeMine.length)} icon={TbActivity} color="grape"
          tip="Task aktif dengan assigneeId = kamu. Ini yang benar-benar kamu pegang sekarang. Lihat tab Task untuk detail." />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <ChartMini title="Status Task Saya" subtitle={`${activeMine.length} task aktif`} option={statusDonutOption} height={180}
          tip="Breakdown status task yang ditugaskan ke kamu: OPEN, IN_PROGRESS, READY_FOR_QC, REOPENED." />
        <ChartMini title="Ditutup 14 Hari Terakhir" subtitle={`${closedThisWeek.length} ditutup 7h terakhir`} option={closedTrendOption} height={180}
          tip="Jumlah task kamu yang transisi ke CLOSED per hari, 14 hari terakhir. Tren turun = velocity drop." />
        <ChartMini title="Jadwal Task" subtitle="Distribusi deadline task aktif" option={dueBarOption} height={180}
          tip="Task aktif dikelompokkan by dueAt: Telat, Hari Ini, Besok, Minggu Ini, Nanti, Tanpa Tenggat." />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Stack gap="lg">
          <SectionCard title="Perlu Perhatian Kamu" subtitle="Task yang sudah lewat deadline atau jatuh tempo hari ini."
            icon={TbAlertTriangle} color="red" count={overdue.length} loading={myTasksQ.isLoading}
            emptyMessage="Tidak ada task yang telat. Keren!"
            tip="Task kamu dengan dueAt < sekarang dan belum CLOSED. Top 5 ditampilkan — klik untuk buka detail."
            action={overdue.length > 0 ? <Button variant="subtle" size="xs" onClick={onGoToTasks}>Semua task</Button> : null}
          >
            {overdue.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
          </SectionCard>

          <SectionCard title="Jatuh Tempo 7 Hari ke Depan" subtitle="Task yang akan jatuh tempo dalam seminggu ke depan."
            icon={TbCalendarDue} color="orange" count={dueSoon.length} loading={myTasksQ.isLoading}
            emptyMessage="Minggu depan kosong. Manfaatkan untuk nyicil task lain."
            tip="Task kamu dengan dueAt dalam 7 hari ke depan. Early-warning — kalau banyak, mulai cicil sekarang."
          >
            {dueSoon.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
          </SectionCard>

          <SectionCard title="Ghost Reminder" subtitle="Task In Progress yang tidak kamu sentuh dalam 3 hari terakhir."
            icon={TbGhost2} color="gray" count={ghost.length} loading={myTasksQ.isLoading}
            emptyMessage="Tidak ada task yang mangkrak. Momentum bagus."
            tip="Task kamu dengan status IN_PROGRESS tapi updatedAt > 3 hari yang lalu. Kemungkinan lupa update atau stuck."
          >
            {ghost.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} showStale />)}
          </SectionCard>
        </Stack>

        <Stack gap="lg">
          <Paper withBorder p="lg" radius="md">
            <Group gap="xs" mb="md">
              <ThemeIcon variant="light" color="teal" size="md" radius="md">
                <TbSparkles size={16} />
              </ThemeIcon>
              <div style={{ flex: 1 }}>
                <Group gap="xs">
                  <Title order={5}>Snapshot Minggu Ini</Title>
                  <InfoTip label="Rangkuman kilat 7 hari terakhir: task closed, yang in-progress, bug baru, dan total task aktif." size={12} />
                </Group>
                <Text size="xs" c="dimmed">Rangkuman aktivitas kamu 7 hari terakhir.</Text>
              </div>
            </Group>
            <SimpleGrid cols={2} spacing="sm">
              <MiniStat label="Task Selesai" value={closedThisWeek.length} icon={TbCircleCheck} color="teal"
                tip="Task kamu yang transisi ke CLOSED dalam 7 hari terakhir. Output delivery — indikator velocity individu." />
              <MiniStat label="Sedang Dikerjakan" value={inProgressCount} icon={TbClockHour4} color="blue"
                tip="Task kamu dengan status IN_PROGRESS saat ini. Idealnya fokus di 1–3 — terlalu banyak = context switching." />
              <MiniStat label="Bug Baru" value={bugsAssignedThisWeek.length} icon={TbBug} color="red"
                tip="Task kind=BUG yang ditugaskan ke kamu dalam 7 hari terakhir." />
              <MiniStat label="Total Ditugaskan" value={activeMine.length} icon={TbListCheck} color="grape"
                tip="Total task aktif (non-CLOSED) yang ditugaskan ke kamu." />
            </SimpleGrid>
            {closedThisWeek.length > 0 && (
              <>
                <Divider my="md" />
                <Text size="xs" c="dimmed" mb="xs" fw={500}>SELESAI MINGGU INI</Text>
                <Stack gap={4}>
                  {closedThisWeek.slice(0, 3).map((t) => (
                    <UnstyledButton key={t.id} onClick={() => openTask(t)} style={{ borderRadius: 6, padding: '4px 8px' }}>
                      <Group gap="xs" wrap="nowrap">
                        <TbCircleCheck size={14} color="var(--mantine-color-teal-6)" />
                        <Text size="sm" truncate>{t.title}</Text>
                      </Group>
                    </UnstyledButton>
                  ))}
                </Stack>
              </>
            )}
          </Paper>

          <SectionCard title="Events Mendatang" subtitle="Jadwal tim hari ini dan 7 hari ke depan."
            icon={TbCalendarEvent} color="orange" count={eventsToday.length + eventsThisWeek.length}
            loading={upcomingEventsQ.isLoading} emptyMessage="Tidak ada event mendatang. Kosong!"
            tip="Event tim yang akan datang dalam 7 hari ke depan. Merah = hari ini."
            action={
              eventsToday.length + eventsThisWeek.length > 0 ? (
                <Button variant="subtle" size="xs" onClick={() => navigate({ to: '/pm', search: { tab: 'events' } })}>
                  Semua events
                </Button>
              ) : null
            }
          >
            {eventsToday.length > 0 && (
              <>
                <Text size="xs" fw={600} c="red" tt="uppercase" mb={4}>Hari ini</Text>
                {eventsToday.slice(0, 3).map((e) => (
                  <UnstyledButton key={e.id}
                    onClick={() => navigate({ to: '/pm', search: { tab: 'events', eventId: e.id } })}
                    style={{ borderRadius: 6, padding: '4px 8px', width: '100%' }}
                  >
                    <Group gap="xs" wrap="nowrap">
                      <TbCalendarEvent size={13} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
                      <Text size="sm" truncate style={{ flex: 1 }}>{e.title}</Text>
                      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                        {new Date(e.startsAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </Group>
                  </UnstyledButton>
                ))}
              </>
            )}
            {eventsThisWeek.slice(0, 5 - Math.min(eventsToday.length, 3)).map((e) => (
              <UnstyledButton key={e.id}
                onClick={() => navigate({ to: '/pm', search: { tab: 'events', eventId: e.id } })}
                style={{ borderRadius: 6, padding: '4px 8px', width: '100%' }}
              >
                <Group gap="xs" wrap="nowrap">
                  <TbCalendarEvent size={13} color="var(--mantine-color-blue-5)" style={{ flexShrink: 0 }} />
                  <Text size="sm" truncate style={{ flex: 1 }}>{e.title}</Text>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    {new Date(e.startsAt).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                </Group>
              </UnstyledButton>
            ))}
          </SectionCard>

          <SectionCard title="Aktivitas Terbaru" subtitle="Notifikasi terbaru tentang task kamu."
            icon={TbBell} color="blue" count={notifs.filter((n) => !n.readAt).length} countLabel="belum dibaca"
            loading={notifsQ.isLoading} emptyMessage="Belum ada aktivitas. Kerjaan sunyi — bagus!"
            tip="Notifikasi terbaru: komentar, assignment, status change, mention. Yang belum dibaca disorot biru."
          >
            {notifs.slice(0, 6).map((n) => {
              const Icon = NOTIF_ICON[n.kind] ?? TbBell
              const color = NOTIF_COLOR[n.kind] ?? 'gray'
              return (
                <UnstyledButton
                  key={n.id}
                  onClick={() => {
                    if (n.taskId) {
                      navigate({ to: '/pm', search: { tab: 'tasks', taskId: n.taskId, ...(n.projectId ? { projectId: n.projectId } : {}) } })
                    } else if (n.projectId) {
                      navigate({ to: '/pm', search: { tab: 'projects', projectId: n.projectId } })
                    }
                  }}
                  style={{
                    borderRadius: 6, padding: '8px 10px',
                    backgroundColor: n.readAt ? 'transparent' : 'var(--mantine-color-blue-light)',
                  }}
                >
                  <Group gap="sm" wrap="nowrap" align="flex-start">
                    <ThemeIcon variant="light" color={color} size="sm" radius="xl">
                      <Icon size={12} />
                    </ThemeIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={n.readAt ? 400 : 500} truncate>{n.title}</Text>
                      {n.body && <Text size="xs" c="dimmed" truncate>{n.body}</Text>}
                      <Text size="xs" c="dimmed">{formatRelativeTime(n.createdAt)}</Text>
                    </div>
                  </Group>
                </UnstyledButton>
              )
            })}
          </SectionCard>
        </Stack>
      </SimpleGrid>

      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <Title order={5}>Proyek Kamu</Title>
            <InfoTip label="Daftar singkat proyek aktif yang kamu miliki atau ikuti. Max 5 ditampilkan. Klik nama proyek untuk buka detail." size={12} />
          </Group>
          <Group gap="xs">
            <Button variant="subtle" size="xs" onClick={onGoToTasks}>Lihat task</Button>
            <Button leftSection={<TbPlus size={14} />} size="xs" onClick={onGoToProjects}>Kelola</Button>
          </Group>
        </Group>
        {activeProjects.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">Belum ada proyek aktif. Buat satu dari tab Proyek.</Text>
        ) : (
          <Stack gap="xs">
            {activeProjects.slice(0, 5).map((p) => (
              <UnstyledButton key={p.id}
                onClick={() => navigate({ to: '/pm', search: { tab: 'projects', projectId: p.id } })}
                style={{ borderRadius: 6, padding: '8px 12px' }}
              >
                <Group justify="space-between">
                  <Text size="sm">{p.name ?? p.id.slice(0, 8)}</Text>
                  <Badge size="xs" variant="light">{p._count.tasks} task</Badge>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  )
}
