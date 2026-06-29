import { ActionIcon, Badge, Card, Group, Stack, Text, Textarea, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { TbCheck, TbPencil, TbTrash, TbX } from 'react-icons/tb'
import { UserAvatar } from '../shared/UserAvatar'
import type { TaskComment } from './types'

export function CommentItem({
  comment,
  canModify,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  comment: TaskComment
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
    <Card withBorder padding="sm" radius="sm">
      <Group justify="space-between" mb={4} wrap="nowrap" align="flex-start">
        <Group gap="xs" wrap="nowrap" align="flex-start" style={{ flex: 1, minWidth: 0 }}>
          <UserAvatar name={comment.author.name} image={comment.author.image} size={22} color="blue" />
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="wrap">
              <Text size="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
                {comment.author.name}
              </Text>
              <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>
                {comment.authorTag}
              </Badge>
              {comment.editedAt && (
                <Tooltip label={`Diedit ${new Date(comment.editedAt).toLocaleString()}`}>
                  <Text size="xs" c="dimmed" fs="italic" style={{ whiteSpace: 'nowrap' }}>
                    (telah diedit)
                  </Text>
                </Tooltip>
              )}
            </Group>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {new Date(comment.createdAt).toLocaleString()}
            </Text>
          </Stack>
        </Group>
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
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
      </Group>

      {editing ? (
        <Stack gap={6}>
          <Textarea value={draft} onChange={(e) => setDraft(e.currentTarget.value)} autosize minRows={2} />
          <Group justify="flex-end" gap={4}>
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Batal" onClick={() => setEditing(false)}>
              <TbX size={14} />
            </ActionIcon>
            <ActionIcon size="sm" variant="filled" aria-label="Simpan" loading={saving} disabled={!draft.trim()} onClick={submit}>
              <TbCheck size={14} />
            </ActionIcon>
          </Group>
        </Stack>
      ) : (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {comment.body}
        </Text>
      )}
    </Card>
  )
}
