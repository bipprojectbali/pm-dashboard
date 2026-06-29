import { Button, Divider, Group, Stack, Text, Textarea } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useEffect, useState } from 'react'
import { CommentItem } from './CommentItem'
import { useWasLoading } from './helpers'
import type { TaskComment } from './types'

export function CommentsSection({
  comments,
  canWrite,
  currentUser,
  onSubmit,
  onEdit,
  onDelete,
  editingId,
  deletingId,
  loading,
  error,
}: {
  comments: TaskComment[]
  canWrite: boolean
  currentUser: { id: string; role: string } | null
  onSubmit: (body: string) => void
  onEdit: (commentId: string, body: string) => void
  onDelete: (commentId: string) => void
  editingId: string | null
  deletingId: string | null
  loading: boolean
  error?: string
}) {
  const [body, setBody] = useState('')
  const wasLoading = useWasLoading(loading)
  useEffect(() => {
    if (wasLoading && !loading && !error) setBody('')
  }, [wasLoading, loading, error])

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN'

  const confirmDelete = (commentId: string) =>
    modals.openConfirmModal({
      title: 'Hapus komentar?',
      children: <Text size="sm">Komentar akan dihapus permanen dan tidak bisa dikembalikan.</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => onDelete(commentId),
    })

  return (
    <Stack gap="sm">
      {comments.length === 0 ? (
        <Text size="sm" c="dimmed">
          No comments yet.
        </Text>
      ) : (
        comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            canModify={currentUser?.id === c.author.id || isAdmin}
            onSave={(text) => onEdit(c.id, text)}
            onDelete={() => confirmDelete(c.id)}
            saving={editingId === c.id}
            deleting={deletingId === c.id}
          />
        ))
      )}
      {canWrite ? (
        <>
          <Divider />
          <Textarea
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            autosize
            minRows={3}
            maxRows={10}
          />
          {error ? (
            <Text size="xs" c="red">
              {error}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button size="sm" onClick={() => onSubmit(body.trim())} disabled={!body.trim() || loading} loading={loading}>
              Comment
            </Button>
          </Group>
        </>
      ) : null}
    </Stack>
  )
}
