import { Box, Button, Group, Stack, Text, Textarea } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck } from 'react-icons/tb'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'
import { TicketCommentItem } from './TicketCommentItem'
import type { TicketDetail } from './types'

export function TicketComments({
  comments,
  ticketId,
}: {
  comments: TicketDetail['comments']
  ticketId: string
}) {
  const queryClient = useQueryClient()
  const { data: sessionData } = useSession()
  const currentUser = sessionData?.user
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN'
  const [body, setBody] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['qc', 'ticket', ticketId] })

  const commentM = useMutation({
    mutationFn: async (b: string) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: b }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal comment')
      return json
    },
    onSuccess: () => {
      setBody('')
      invalidate()
    },
    onError: (err) => notifyError(err),
  })

  const editM = useMutation({
    mutationFn: async ({ commentId, b }: { commentId: string; b: string }) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/comments/${commentId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: b }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal edit komentar')
      return json
    },
    onSuccess: () => {
      notifySuccess('Komentar diperbarui')
      invalidate()
    },
    onError: (err) => notifyError(err),
  })

  const deleteM = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal hapus komentar')
      return json
    },
    onSuccess: () => {
      notifySuccess('Komentar dihapus')
      invalidate()
    },
    onError: (err) => notifyError(err),
  })

  const confirmDelete = (commentId: string) =>
    modals.openConfirmModal({
      title: 'Hapus komentar',
      children: <Text size="sm">Komentar ini akan dihapus permanen. Lanjutkan?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteM.mutate(commentId),
    })

  return (
    <Box>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb="xs">Comments</Text>
      <Stack gap="sm">
        {comments.map((c) => (
          <TicketCommentItem
            key={c.id}
            comment={c}
            canModify={currentUser?.id === c.author?.id || isAdmin}
            onSave={(b) => editM.mutate({ commentId: c.id, b })}
            onDelete={() => confirmDelete(c.id)}
            saving={editM.isPending}
            deleting={deleteM.isPending}
          />
        ))}
        <Textarea
          placeholder="Add comment…"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end">
          <Button
            size="xs"
            leftSection={<TbCheck size={14} />}
            disabled={!body.trim() || commentM.isPending}
            onClick={() => commentM.mutate(body.trim())}
          >
            Post
          </Button>
        </Group>
      </Stack>
    </Box>
  )
}
