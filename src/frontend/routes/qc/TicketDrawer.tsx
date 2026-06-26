import { Button, Drawer, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

interface AdminUser { id: string; name: string; email: string; role: string; blocked: boolean }
import { TicketComments } from './TicketComments'
import { TicketDrawerHeader } from './TicketDrawerHeader'
import { TicketEvidence } from './TicketEvidence'
import { TicketTimeline } from './TicketTimeline'
import type { TicketDetail } from './types'

export function TicketDrawer({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: sessionData } = useSession()
  const canDelete = sessionData?.user?.role === 'ADMIN' || sessionData?.user?.role === 'SUPER_ADMIN'
  const canAssign = canDelete

  const usersQ = useQuery({
    queryKey: ['admin-users'],
    queryFn: () =>
      fetch('/api/admin/users', { credentials: 'include' })
        .then((r) => r.json() as Promise<{ users: AdminUser[] }>),
    enabled: canAssign,
    staleTime: 60_000,
  })

  const detailQ = useQuery({
    queryKey: ['qc', 'ticket', ticketId],
    queryFn: () =>
      fetch(`/api/qc/tickets/${ticketId}`, { credentials: 'include' }).then(
        (r) => r.json() as Promise<{ ticket: TicketDetail }>,
      ),
  })

  const [editMode, setEditMode] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftRoute, setDraftRoute] = useState('')
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [revisionReason, setRevisionReason] = useState('')

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
      const res = await fetch(`/api/qc/tickets/${ticketId}`, { method: 'DELETE', credentials: 'include' })
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

  const revisionM = useMutation({
    mutationFn: async (comment: string) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/request-revision`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal minta revisi')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc'] })
      queryClient.invalidateQueries({ queryKey: ['qc', 'ticket', ticketId] })
      setRevisionOpen(false)
      setRevisionReason('')
      notifySuccess('Ticket dikembalikan ke antrean (REOPENED)')
    },
    onError: (err) => notifyError(err),
  })

  const ticket = detailQ.data?.ticket

  const submitRevision = () => {
    const reason = revisionReason.trim()
    if (!reason) { notifyError('Alasan revisi wajib diisi'); return }
    revisionM.mutate(reason)
  }

  const saveEdits = () => {
    if (!ticket) return
    const payload: Record<string, unknown> = {}
    const title = draftTitle.trim()
    const description = draftDescription.trim()
    const route = draftRoute.trim()
    if (!title) { notifyError('Title wajib diisi'); return }
    if (!description) { notifyError('Description wajib diisi'); return }
    if (title !== ticket.title) payload.title = title
    if (description !== ticket.description) payload.description = description
    if (route !== (ticket.route ?? '')) payload.route = route || null
    if (!Object.keys(payload).length) { setEditMode(false); return }
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

  return (
    <Drawer opened onClose={onClose} size="xl" position="right" title="Detail Ticket">
      {!ticket && <Text c="dimmed">Memuat…</Text>}
      {ticket && (
        <Stack gap="md">
          <TicketDrawerHeader
            ticket={ticket}
            editMode={editMode}
            draftTitle={draftTitle}
            draftDescription={draftDescription}
            draftRoute={draftRoute}
            setDraftTitle={setDraftTitle}
            setDraftDescription={setDraftDescription}
            setDraftRoute={setDraftRoute}
            onEdit={() => setEditMode(true)}
            onSave={saveEdits}
            onCancel={cancelEdits}
            onDelete={confirmDelete}
            canDelete={canDelete}
            isPending={patchM.isPending}
          />
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
          {ticket.status === 'READY_FOR_QC' && (
            <Button
              variant="light"
              color="orange"
              onClick={() => setRevisionOpen(true)}
              disabled={patchM.isPending}
            >
              Minta Revisi
            </Button>
          )}
          {canAssign ? (
            <Select
              label="Assignee"
              placeholder="Belum di-assign"
              value={ticket.assignee?.id ?? null}
              onChange={(v) => patchM.mutate({ assigneeId: v ?? null })}
              data={(usersQ.data?.users ?? [])
                .filter((u) => !u.blocked)
                .map((u) => ({ value: u.id, label: `${u.name} (${u.role})` }))}
              clearable
              searchable
              disabled={patchM.isPending || usersQ.isLoading}
            />
          ) : ticket.assignee ? (
            <Text size="sm"><Text span c="dimmed" size="xs">Assignee: </Text>{ticket.assignee.name}</Text>
          ) : null}
          <TicketEvidence evidence={ticket.evidence} ticketId={ticketId} />
          <TicketComments comments={ticket.comments} ticketId={ticketId} />
          <TicketTimeline statusChanges={ticket.statusChanges} />
        </Stack>
      )}
      <Modal
        opened={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        title="Minta Revisi"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Ticket akan dikembalikan ke antrean (REOPENED) untuk diperbaiki ulang. Jelaskan apa yang perlu direvisi —
            komentar ini wajib diisi.
          </Text>
          <Textarea
            label="Alasan revisi"
            placeholder="Contoh: fix belum menangani kasus input kosong, masih error saat…"
            value={revisionReason}
            onChange={(e) => setRevisionReason(e.currentTarget.value)}
            minRows={3}
            autosize
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRevisionOpen(false)} disabled={revisionM.isPending}>
              Batal
            </Button>
            <Button
              color="orange"
              onClick={submitRevision}
              loading={revisionM.isPending}
              disabled={!revisionReason.trim()}
            >
              Kirim & Reopen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  )
}
