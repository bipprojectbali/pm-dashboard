import { ActionIcon, Badge, Box, Button, Group, Paper, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core'
import { TbCheck, TbEdit, TbTrash, TbX } from 'react-icons/tb'
import { type TicketDetail, priorityBadge, statusBadge } from './types'

interface Props {
  ticket: TicketDetail
  editMode: boolean
  draftTitle: string
  draftDescription: string
  draftRoute: string
  setDraftTitle: (v: string) => void
  setDraftDescription: (v: string) => void
  setDraftRoute: (v: string) => void
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  canDelete: boolean
  isPending: boolean
}

export function TicketDrawerHeader({
  ticket,
  editMode,
  draftTitle,
  draftDescription,
  draftRoute,
  setDraftTitle,
  setDraftDescription,
  setDraftRoute,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  canDelete,
  isPending,
}: Props) {
  const sb = statusBadge[ticket.status] ?? statusBadge.OPEN
  const pb = priorityBadge[ticket.priority] ?? priorityBadge.MEDIUM

  return (
    <>
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
            <Title order={4} style={{ wordBreak: 'break-word' }}>{ticket.title}</Title>
          )}
        </Box>
        <Group gap="xs" wrap="nowrap">
          {editMode ? (
            <>
              <Button size="xs" leftSection={<TbCheck size={14} />} onClick={onSave} loading={isPending}>
                Simpan
              </Button>
              <Button size="xs" variant="subtle" leftSection={<TbX size={14} />} onClick={onCancel} disabled={isPending}>
                Batal
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="light" leftSection={<TbEdit size={14} />} onClick={onEdit}>Edit</Button>
              {canDelete && (
                <Tooltip label="Hapus ticket">
                  <ActionIcon color="red" variant="subtle" onClick={onDelete} aria-label="Hapus ticket">
                    <TbTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </>
          )}
        </Group>
      </Group>

      <Group gap="xs">
        <Badge color={sb.color} variant="light">{sb.label}</Badge>
        <Badge color={pb.color} variant="light">{pb.label}</Badge>
        {ticket.tags.map((tt) => (
          <Badge key={tt.tag.id} color={tt.tag.color} variant="outline" size="sm">{tt.tag.name}</Badge>
        ))}
      </Group>

      <Box>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>Description</Text>
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
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</Text>
          </Paper>
        )}
      </Box>

      <Box>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>Route / area</Text>
        {editMode ? (
          <TextInput
            value={draftRoute}
            onChange={(e) => setDraftRoute(e.currentTarget.value)}
            placeholder="/admin?tab=users"
          />
        ) : (
          <Text size="sm" c={ticket.route ? undefined : 'dimmed'}>{ticket.route || '—'}</Text>
        )}
      </Box>
    </>
  )
}
