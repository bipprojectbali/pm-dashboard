import { ActionIcon, Group, Paper, Stack, Text, Textarea, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { TbCheck, TbPencil, TbTrash, TbX } from 'react-icons/tb'
import type { TicketDetail } from './types'

type Comment = TicketDetail['comments'][number]

export function TicketCommentItem({
  comment,
  canModify,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  comment: Comment
  canModify: boolean
  onSave: (body: string) => void
  onDelete: () => void
  saving: boolean
  deleting: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)

  const startEdit = () => {
    setDraft(comment.body)
    setEditing(true)
  }
  const submit = () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === comment.body) {
      setEditing(false)
      return
    }
    onSave(trimmed)
    setEditing(false)
  }

  return (
    <Paper withBorder p="xs" radius="sm">
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <Text size="xs" fw={600}>{comment.author?.name ?? 'Unknown'}</Text>
          <Text size="xs" c="dimmed">{new Date(comment.createdAt).toLocaleString()}</Text>
          {comment.editedAt && (
            <Tooltip label={`Diedit ${new Date(comment.editedAt).toLocaleString()}`}>
              <Text size="xs" c="dimmed" fs="italic">(telah diedit)</Text>
            </Tooltip>
          )}
        </Group>
        {canModify && !editing && (
          <Group gap={2} wrap="nowrap">
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Edit komentar" onClick={startEdit}>
              <TbPencil size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Hapus komentar"
              loading={deleting}
              onClick={onDelete}
            >
              <TbTrash size={14} />
            </ActionIcon>
          </Group>
        )}
      </Group>

      {editing ? (
        <Stack gap={6}>
          <Textarea value={draft} onChange={(e) => setDraft(e.currentTarget.value)} autosize minRows={2} />
          <Group justify="flex-end" gap={4}>
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Batal" onClick={() => setEditing(false)}>
              <TbX size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="filled"
              aria-label="Simpan"
              loading={saving}
              disabled={!draft.trim()}
              onClick={submit}
            >
              <TbCheck size={14} />
            </ActionIcon>
          </Group>
        </Stack>
      ) : (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{comment.body}</Text>
      )}
    </Paper>
  )
}
