import {
  ActionIcon,
  AppShell,
  Badge,
  Burger,
  Button,
  Card,
  Container,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { TbAlertTriangle, TbBug, TbPlus, TbRefresh } from 'react-icons/tb'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'
import { NotificationBell } from '@/frontend/components/NotificationBell'
import { SidebarAppSwitcher } from '@/frontend/components/SidebarAppSwitcher'
import { SidebarUserFooter } from '@/frontend/components/SidebarUserFooter'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'
import { CreateTicketModal } from './qc/CreateTicketModal'
import { TicketDrawer } from './qc/TicketDrawer'
import { TicketsTable } from './qc/TicketsTable'
import type { QcContext, SelfProject, Ticket } from './qc/types'

const validStatuses = ['all', 'open', 'in-progress', 'ready', 'closed'] as const
type StatusFilter = (typeof validStatuses)[number]
type QcSearch = { status: StatusFilter; ticketId?: string }

export const Route = createFileRoute('/qc')({
  validateSearch: (search: Record<string, unknown>): QcSearch => {
    const status = validStatuses.includes(search.status as StatusFilter) ? (search.status as StatusFilter) : 'open'
    const ticketId = typeof search.ticketId === 'string' ? search.ticketId : undefined
    return ticketId ? { status, ticketId } : { status }
  },
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
      if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(data.user.role)) {
        throw redirect({ to: '/pm', search: { tab: 'overview' } })
      }
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: QcPage,
})

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Group justify="space-between">
      <Text size="xs">{label}</Text>
      <Badge size="sm" color={color} variant="light">{value}</Badge>
    </Group>
  )
}

function NoSelfProject({ role }: { role?: string }) {
  return (
    <Card withBorder radius="md" p="xl">
      <Stack align="center" gap="md">
        <ThemeIcon size={60} radius="xl" color="orange" variant="light">
          <TbAlertTriangle size={32} />
        </ThemeIcon>
        <Stack align="center" gap={4}>
          <Title order={4}>Belum ada self-project</Title>
          <Text size="sm" c="dimmed" ta="center" maw={480}>
            QC ticketing butuh satu project yang ditandai sebagai self-project. Super-admin harus set dulu via{' '}
            <code>PUT /api/admin/self-project</code> (atau via MCP tool <code>qc_self_project_set</code>).
          </Text>
        </Stack>
        {role !== 'SUPER_ADMIN' && <Text size="xs" c="dimmed">Hubungi super-admin.</Text>}
      </Stack>
    </Card>
  )
}

function QcPage() {
  const { status, ticketId } = Route.useSearch()
  const navigate = useNavigate()
  const { data: sessionData } = useSession()
  const user = sessionData?.user
  const logout = useLogout()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [opened, { toggle }] = useDisclosure(false)
  const [createOpen, setCreateOpen] = useState(false)
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const toggleAll = (ids: string[]) =>
    setSelectedIds((prev) => ids.every((id) => prev.has(id)) ? new Set() : new Set(ids))

  const bulkUpdateM = useMutation({
    mutationFn: async ({ ids, newStatus }: { ids: string[]; newStatus: string }) => {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/qc/tickets/${id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          }).then((r) => r.json()),
        ),
      )
      const failed = results.filter((r) => r.error)
      if (failed.length) throw new Error(`${failed.length} ticket gagal diupdate`)
      return results
    },
    onSuccess: (_, { ids }) => {
      notifySuccess({ message: `${ids.length} ticket diupdate.` })
      setSelectedIds(new Set())
      setBulkStatus(null)
      queryClient.invalidateQueries({ queryKey: ['qc'] })
    },
    onError: (err) => notifyError(err),
  })

  const ctxQ = useQuery({
    queryKey: ['qc', 'context'],
    queryFn: () => fetch('/api/qc/context', { credentials: 'include' }).then((r) => r.json() as Promise<QcContext>),
  })
  const ticketsQ = useQuery({
    queryKey: ['qc', 'tickets', status],
    queryFn: () =>
      fetch(`/api/qc/tickets?status=${status}`, { credentials: 'include' }).then(
        (r) => r.json() as Promise<{ tickets: Ticket[]; selfProject: SelfProject | null }>,
      ),
    enabled: !!ctxQ.data?.selfProject,
  })

  const tickets = ticketsQ.data?.tickets ?? []
  const selfProject = ctxQ.data?.selfProject
  const stats = ctxQ.data?.stats

  const openTicket = (id: string) => navigate({ to: '/qc', search: { status, ticketId: id } })
  const closeTicketDrawer = () => navigate({ to: '/qc', search: { status } })

  const handleLogout = () =>
    modals.openConfirmModal({
      title: 'Keluar?',
      children: <Text size="sm">Sesi akan diakhiri.</Text>,
      labels: { confirm: 'Keluar', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => logout.mutate(),
    })

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Group gap="xs">
              <ThemeIcon color="red" variant="light" radius="md"><TbBug size={18} /></ThemeIcon>
              <Stack gap={0}>
                <Title order={4}>QC Tickets</Title>
                {selfProject && <Text size="xs" c="dimmed">{selfProject.name}</Text>}
              </Stack>
            </Group>
          </Group>
          <Group><NotificationBell /></Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack justify="space-between" h="100%">
          <Stack gap="sm">
            <SidebarAppSwitcher current="qc" role={user?.role} collapsed={false} />
            {stats && (
              <Card withBorder radius="md" p="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">Ringkasan</Text>
                <Stack gap={4}>
                  <StatRow label="Open" value={(stats.OPEN ?? 0) + (stats.REOPENED ?? 0)} color="red" />
                  <StatRow label="In progress" value={stats.IN_PROGRESS ?? 0} color="blue" />
                  <StatRow label="Ready for QC" value={stats.READY_FOR_QC ?? 0} color="violet" />
                  <StatRow label="Closed" value={stats.CLOSED ?? 0} color="green" />
                </Stack>
              </Card>
            )}
          </Stack>
          <SidebarUserFooter
            user={user ?? null}
            collapsed={false}
            onToggleCollapse={() => {}}
            onLogout={handleLogout}
            isLoggingOut={logout.isPending}
          />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="xl" py="lg">
          {!selfProject && <NoSelfProject role={user?.role} />}
          {selfProject && (
            <Stack gap="md">
              <Group justify="space-between" wrap="wrap">
                <SegmentedControl
                  value={status}
                  onChange={(v) => navigate({ to: '/qc', search: { status: v as StatusFilter } })}
                  data={[
                    { label: 'Open', value: 'open' },
                    { label: 'In Progress', value: 'in-progress' },
                    { label: 'Ready for QC', value: 'ready' },
                    { label: 'Closed', value: 'closed' },
                    { label: 'All', value: 'all' },
                  ]}
                  size={isMobile ? 'xs' : 'sm'}
                />
                <Group gap="xs">
                  <Tooltip label="Refresh">
                    <ActionIcon variant="light" onClick={() => ticketsQ.refetch()}>
                      <TbRefresh size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Button leftSection={<TbPlus size={14} />} onClick={() => setCreateOpen(true)}>
                    New Ticket
                  </Button>
                </Group>
              </Group>
              {selectedIds.size > 0 && (
                <Paper withBorder p="sm" radius="md">
                  <Group gap="sm" wrap="wrap">
                    <Text size="sm" fw={500}>{selectedIds.size} ticket dipilih</Text>
                    <Select
                      placeholder="Pilih status baru"
                      value={bulkStatus}
                      onChange={setBulkStatus}
                      size="xs"
                      w={180}
                      data={[
                        { value: 'OPEN', label: 'Open' },
                        { value: 'IN_PROGRESS', label: 'In Progress' },
                        { value: 'READY_FOR_QC', label: 'Ready for QC' },
                        { value: 'REOPENED', label: 'Reopened' },
                        { value: 'CLOSED', label: 'Closed' },
                      ]}
                    />
                    <Button
                      size="xs"
                      disabled={!bulkStatus || bulkUpdateM.isPending}
                      loading={bulkUpdateM.isPending}
                      onClick={() => bulkStatus && bulkUpdateM.mutate({ ids: [...selectedIds], newStatus: bulkStatus })}
                    >
                      Update Status
                    </Button>
                    <Button size="xs" variant="subtle" color="gray" onClick={() => { setSelectedIds(new Set()); setBulkStatus(null) }}>
                      Batal
                    </Button>
                  </Group>
                </Paper>
              )}
              <TicketsTable
                tickets={tickets}
                loading={ticketsQ.isLoading}
                onOpen={openTicket}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                onToggleAll={toggleAll}
                emptyHint={
                  status === 'open'
                    ? 'Tidak ada ticket open. Buat ticket baru kalau nemu bug.'
                    : 'Tidak ada ticket dengan filter ini.'
                }
              />
            </Stack>
          )}
        </Container>
      </AppShell.Main>

      <CreateTicketModal opened={createOpen} onClose={() => setCreateOpen(false)} />
      {ticketId && <TicketDrawer ticketId={ticketId} onClose={closeTicketDrawer} />}
    </AppShell>
  )
}
