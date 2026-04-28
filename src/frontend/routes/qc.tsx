import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Card,
  Container,
  Drawer,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Timeline,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  TbAlertTriangle,
  TbBug,
  TbCheck,
  TbCircleCheck,
  TbClockHour4,
  TbEdit,
  TbExternalLink,
  TbLink,
  TbMessage,
  TbPaperclip,
  TbPlus,
  TbRefresh,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { NotificationBell } from '@/frontend/components/NotificationBell'
import { SidebarAppSwitcher } from '@/frontend/components/SidebarAppSwitcher'
import { SidebarUserFooter } from '@/frontend/components/SidebarUserFooter'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

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

interface Ticket {
  id: string
  title: string
  description: string
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  route: string | null
  createdAt: string
  reporter: { id: string; name: string; email: string } | null
  assignee: { id: string; name: string; email: string } | null
  _count: { evidence: number; comments: number }
}

interface SelfProject {
  id: string
  name: string
  githubRepo: string | null
}

interface Context {
  selfProject: SelfProject | null
  canWrite: boolean
  stats: Record<string, number> | null
}

const statusBadge: Record<string, { color: string; label: string }> = {
  OPEN: { color: 'red', label: 'Open' },
  REOPENED: { color: 'orange', label: 'Reopened' },
  IN_PROGRESS: { color: 'blue', label: 'In Progress' },
  READY_FOR_QC: { color: 'violet', label: 'Ready for QC' },
  CLOSED: { color: 'green', label: 'Closed' },
}

const priorityBadge: Record<string, { color: string; label: string }> = {
  LOW: { color: 'gray', label: 'Low' },
  MEDIUM: { color: 'blue', label: 'Medium' },
  HIGH: { color: 'orange', label: 'High' },
  CRITICAL: { color: 'red', label: 'Critical' },
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

  const ctxQ = useQuery({
    queryKey: ['qc', 'context'],
    queryFn: () => fetch('/api/qc/context', { credentials: 'include' }).then((r) => r.json() as Promise<Context>),
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

  function openTicket(id: string) {
    navigate({ to: '/qc', search: { status, ticketId: id } })
  }
  function closeTicketDrawer() {
    navigate({ to: '/qc', search: { status } })
  }

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
              <ThemeIcon color="red" variant="light" radius="md">
                <TbBug size={18} />
              </ThemeIcon>
              <Stack gap={0}>
                <Title order={4}>QC Tickets</Title>
                {selfProject && (
                  <Text size="xs" c="dimmed">
                    {selfProject.name}
                  </Text>
                )}
              </Stack>
            </Group>
          </Group>
          <Group>
            <NotificationBell />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack justify="space-between" h="100%">
          <Stack gap="sm">
            <SidebarAppSwitcher current="qc" role={user?.role} collapsed={false} />
            {stats && (
              <Card withBorder radius="md" p="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
                  Ringkasan
                </Text>
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
            accentColor="red"
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

              <TicketsTable
                tickets={tickets}
                loading={ticketsQ.isLoading}
                onOpen={openTicket}
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

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Group justify="space-between">
      <Text size="xs">{label}</Text>
      <Badge size="sm" color={color} variant="light">
        {value}
      </Badge>
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

function TicketsTable({
  tickets,
  loading,
  onOpen,
  emptyHint,
}: {
  tickets: Ticket[]
  loading: boolean
  onOpen: (id: string) => void
  emptyHint: string
}) {
  if (loading) {
    return (
      <Paper withBorder p="lg" radius="md">
        <Text c="dimmed" ta="center">
          Memuat tickets…
        </Text>
      </Paper>
    )
  }
  if (tickets.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Stack align="center" gap="xs">
          <ThemeIcon size={40} radius="xl" color="gray" variant="light">
            <TbCircleCheck size={22} />
          </ThemeIcon>
          <Text c="dimmed" ta="center">
            {emptyHint}
          </Text>
        </Stack>
      </Paper>
    )
  }
  return (
    <Card withBorder radius="md" p={0}>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>Priority</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Reporter</Table.Th>
            <Table.Th>Assignee</Table.Th>
            <Table.Th>Activity</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tickets.map((t) => {
            const pb = priorityBadge[t.priority] ?? priorityBadge.MEDIUM
            const sb = statusBadge[t.status] ?? statusBadge.OPEN
            return (
              <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(t.id)}>
                <Table.Td>
                  <Stack gap={2}>
                    <Text size="sm" fw={500} lineClamp={1}>
                      {t.title}
                    </Text>
                    {t.route && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {t.route}
                      </Text>
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Badge color={pb.color} variant="light" size="sm">
                    {pb.label}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={sb.color} variant="light" size="sm">
                    {sb.label}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {t.reporter?.name ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {t.assignee?.name ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Tooltip label="Comments">
                      <Group gap={4}>
                        <TbMessage size={12} />
                        <Text size="xs">{t._count.comments}</Text>
                      </Group>
                    </Tooltip>
                    <Tooltip label="Evidence">
                      <Group gap={4}>
                        <TbPaperclip size={12} />
                        <Text size="xs">{t._count.evidence}</Text>
                      </Group>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Card>
  )
}

function CreateTicketModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM')
  const [route, setRoute] = useState('')
  const [evidence, setEvidence] = useState('')

  useEffect(() => {
    if (!opened) {
      setTitle('')
      setDescription('')
      setPriority('MEDIUM')
      setRoute('')
      setEvidence('')
    }
  }, [opened])

  const createM = useMutation({
    mutationFn: async () => {
      const urls = evidence
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      const res = await fetch('/api/qc/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          priority,
          route: route || undefined,
          evidenceUrls: urls.length ? urls : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal membuat ticket')
      return json
    },
    onSuccess: () => {
      notifySuccess({ message: 'Ticket dibuat.' })
      queryClient.invalidateQueries({ queryKey: ['qc'] })
      onClose()
    },
    onError: (err) => notifyError(err),
  })

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !createM.isPending

  return (
    <Modal opened={opened} onClose={onClose} title="New QC Ticket" size="lg">
      <Stack gap="sm">
        <TextInput
          label="Title"
          placeholder="Short summary, e.g. Login button freeze setelah 2 klik"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          required
          maxLength={500}
        />
        <Textarea
          label="Description"
          placeholder="Steps to reproduce, expected vs actual, env, etc."
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          minRows={5}
          autosize
          required
        />
        <Group grow>
          <Select
            label="Priority"
            value={priority}
            onChange={(v) => v && setPriority(v as typeof priority)}
            data={[
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
              { value: 'CRITICAL', label: 'Critical' },
            ]}
          />
          <TextInput
            label="Route / area (optional)"
            placeholder="/admin?tab=users"
            value={route}
            onChange={(e) => setRoute(e.currentTarget.value)}
          />
        </Group>
        <Textarea
          label="Evidence URLs (optional, one per line)"
          placeholder="https://...&#10;https://..."
          value={evidence}
          onChange={(e) => setEvidence(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => createM.mutate()} disabled={!canSubmit} loading={createM.isPending}>
            Buat Ticket
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

interface TicketDetail extends Ticket {
  description: string
  tags: { tag: { id: string; name: string; color: string } }[]
  evidence: { id: string; url: string; kind: string; label: string | null; createdAt: string }[]
  comments: {
    id: string
    body: string
    createdAt: string
    author: { id: string; name: string; email: string; role: string } | null
  }[]
  checklist: { id: string; title: string; done: boolean; order: number }[]
  statusChanges: {
    id: string
    fromStatus: string
    toStatus: string
    createdAt: string
    author: { id: string; name: string; email: string } | null
  }[]
}

function TicketDrawer({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: sessionData } = useSession()
  const canDelete = sessionData?.user?.role === 'ADMIN' || sessionData?.user?.role === 'SUPER_ADMIN'
  const detailQ = useQuery({
    queryKey: ['qc', 'ticket', ticketId],
    queryFn: () =>
      fetch(`/api/qc/tickets/${ticketId}`, { credentials: 'include' }).then(
        (r) => r.json() as Promise<{ ticket: TicketDetail }>,
      ),
  })
  const [commentBody, setCommentBody] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftRoute, setDraftRoute] = useState('')

  useEffect(() => {
    if (!editMode && detailQ.data?.ticket) {
      setDraftTitle(detailQ.data.ticket.title)
      setDraftDescription(detailQ.data.ticket.description)
      setDraftRoute(detailQ.data.ticket.route ?? '')
    }
  }, [editMode, detailQ.data])

  const patchM = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal update')
      return json
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['qc'] })
      queryClient.invalidateQueries({ queryKey: ['qc', 'ticket', ticketId] })
      if ('title' in variables || 'description' in variables || 'route' in variables) {
        setEditMode(false)
        notifySuccess('Ticket tersimpan')
      }
    },
    onError: (err) => notifyError(err),
  })

  const deleteM = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/qc/tickets/${ticketId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Gagal hapus')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc'] })
      notifySuccess('Ticket dihapus')
      onClose()
    },
    onError: (err) => notifyError(err),
  })

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Hapus ticket?',
      children: (
        <Text size="sm">
          Ticket beserta comments, evidence, checklist, dan timeline-nya akan dihapus permanen. Aksi ini tidak dapat
          dibatalkan.
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteM.mutate(),
    })

  const saveEdits = () => {
    if (!ticket) return
    const payload: Record<string, unknown> = {}
    const title = draftTitle.trim()
    const description = draftDescription.trim()
    const route = draftRoute.trim()
    if (!title) {
      notifyError('Title wajib diisi')
      return
    }
    if (!description) {
      notifyError('Description wajib diisi')
      return
    }
    if (title !== ticket.title) payload.title = title
    if (description !== ticket.description) payload.description = description
    const currentRoute = ticket.route ?? ''
    if (route !== currentRoute) payload.route = route || null
    if (!Object.keys(payload).length) {
      setEditMode(false)
      return
    }
    patchM.mutate(payload)
  }

  const cancelEdits = () => {
    if (ticket) {
      setDraftTitle(ticket.title)
      setDraftDescription(ticket.description)
      setDraftRoute(ticket.route ?? '')
    }
    setEditMode(false)
  }
  const commentM = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal comment')
      return json
    },
    onSuccess: () => {
      setCommentBody('')
      queryClient.invalidateQueries({ queryKey: ['qc', 'ticket', ticketId] })
    },
    onError: (err) => notifyError(err),
  })
  const evidenceM = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/evidence`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal tambah evidence')
      return json
    },
    onSuccess: () => {
      setEvidenceUrl('')
      queryClient.invalidateQueries({ queryKey: ['qc', 'ticket', ticketId] })
    },
    onError: (err) => notifyError(err),
  })

  const ticket = detailQ.data?.ticket
  const sb = ticket ? statusBadge[ticket.status] ?? statusBadge.OPEN : null
  const pb = ticket ? priorityBadge[ticket.priority] ?? priorityBadge.MEDIUM : null

  return (
    <Drawer opened onClose={onClose} size="xl" position="right" title="Detail Ticket">
      {!ticket && <Text c="dimmed">Memuat…</Text>}
      {ticket && (
        <Stack gap="md">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Box style={{ flex: 1, minWidth: 0 }}>
              {editMode ? (
                <TextInput
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.currentTarget.value)}
                  size="md"
                  placeholder="Title"
                  maxLength={500}
                />
              ) : (
                <Title order={4} style={{ wordBreak: 'break-word' }}>
                  {ticket.title}
                </Title>
              )}
            </Box>
            <Group gap="xs" wrap="nowrap">
              {editMode ? (
                <>
                  <Button
                    size="xs"
                    leftSection={<TbCheck size={14} />}
                    onClick={saveEdits}
                    loading={patchM.isPending}
                  >
                    Simpan
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<TbX size={14} />}
                    onClick={cancelEdits}
                    disabled={patchM.isPending}
                  >
                    Batal
                  </Button>
                </>
              ) : (
                <>
                  <Button size="xs" variant="light" leftSection={<TbEdit size={14} />} onClick={() => setEditMode(true)}>
                    Edit
                  </Button>
                  {canDelete && (
                    <Tooltip label="Hapus ticket">
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={confirmDelete}
                        loading={deleteM.isPending}
                        aria-label="Hapus ticket"
                      >
                        <TbTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </>
              )}
            </Group>
          </Group>

          <Group gap="xs">
            {sb && (
              <Badge color={sb.color} variant="light">
                {sb.label}
              </Badge>
            )}
            {pb && (
              <Badge color={pb.color} variant="light">
                {pb.label}
              </Badge>
            )}
            {ticket.tags.map((tt) => (
              <Badge key={tt.tag.id} color={tt.tag.color} variant="outline" size="sm">
                {tt.tag.name}
              </Badge>
            ))}
          </Group>

          <Box>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
              Description
            </Text>
            {editMode ? (
              <Textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.currentTarget.value)}
                autosize
                minRows={5}
                placeholder="Steps to reproduce, expected vs actual, env, etc."
              />
            ) : (
              <Paper withBorder p="sm" radius="sm">
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {ticket.description}
                </Text>
              </Paper>
            )}
          </Box>

          <Box>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
              Route / area
            </Text>
            {editMode ? (
              <TextInput
                value={draftRoute}
                onChange={(e) => setDraftRoute(e.currentTarget.value)}
                placeholder="/admin?tab=users"
              />
            ) : (
              <Text size="sm" c={ticket.route ? undefined : 'dimmed'}>
                {ticket.route || '—'}
              </Text>
            )}
          </Box>

          <Group grow>
            <Select
              label="Status"
              value={ticket.status}
              onChange={(v) => v && patchM.mutate({ status: v })}
              data={[
                { value: 'OPEN', label: 'Open' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'READY_FOR_QC', label: 'Ready for QC' },
                { value: 'REOPENED', label: 'Reopened' },
                { value: 'CLOSED', label: 'Closed' },
              ]}
              disabled={patchM.isPending}
            />
            <Select
              label="Priority"
              value={ticket.priority}
              onChange={(v) => v && patchM.mutate({ priority: v })}
              data={[
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
              disabled={patchM.isPending}
            />
          </Group>

          <Box>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb="xs">
              Evidence
            </Text>
            <Stack gap="xs">
              {ticket.evidence.map((e) => (
                <Group key={e.id} gap="xs" wrap="nowrap">
                  <TbLink size={14} />
                  <Text component="a" href={e.url} target="_blank" rel="noopener" size="sm" truncate>
                    {e.label || e.url}
                  </Text>
                  <ActionIcon component="a" href={e.url} target="_blank" rel="noopener" variant="subtle" size="sm">
                    <TbExternalLink size={12} />
                  </ActionIcon>
                </Group>
              ))}
              <Group gap="xs">
                <TextInput
                  style={{ flex: 1 }}
                  placeholder="https://… (screenshot, log, repro link)"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.currentTarget.value)}
                />
                <Button
                  size="xs"
                  disabled={!evidenceUrl.trim() || evidenceM.isPending}
                  onClick={() => evidenceM.mutate(evidenceUrl.trim())}
                >
                  Tambah
                </Button>
              </Group>
            </Stack>
          </Box>

          <Box>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb="xs">
              Comments
            </Text>
            <Stack gap="sm">
              {ticket.comments.map((c) => (
                <Paper key={c.id} withBorder p="xs" radius="sm">
                  <Group justify="space-between" mb={4}>
                    <Text size="xs" fw={600}>
                      {c.author?.name ?? 'Unknown'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {new Date(c.createdAt).toLocaleString()}
                    </Text>
                  </Group>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {c.body}
                  </Text>
                </Paper>
              ))}
              <Textarea
                placeholder="Add comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.currentTarget.value)}
                autosize
                minRows={2}
              />
              <Group justify="flex-end">
                <Button
                  size="xs"
                  leftSection={<TbCheck size={14} />}
                  disabled={!commentBody.trim() || commentM.isPending}
                  onClick={() => commentM.mutate(commentBody.trim())}
                >
                  Post
                </Button>
              </Group>
            </Stack>
          </Box>

          {ticket.statusChanges.length > 0 && (
            <Box>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb="xs">
                Timeline
              </Text>
              <Timeline active={ticket.statusChanges.length} bulletSize={18} lineWidth={2}>
                {ticket.statusChanges.map((sc) => (
                  <Timeline.Item
                    key={sc.id}
                    bullet={<TbClockHour4 size={10} />}
                    title={`${sc.fromStatus} → ${sc.toStatus}`}
                  >
                    <Text size="xs" c="dimmed">
                      {sc.author?.name ?? 'System'} • {new Date(sc.createdAt).toLocaleString()}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            </Box>
          )}
        </Stack>
      )}
    </Drawer>
  )
}
