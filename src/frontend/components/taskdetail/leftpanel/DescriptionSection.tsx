import { ActionIcon, Button, Group, Stack, Text, Textarea } from '@mantine/core'
import { TbCheck, TbEdit, TbX } from 'react-icons/tb'

export function DescriptionSection({
  description,
  canWrite,
  editingDescription,
  draftDescription,
  onDraftDescriptionChange,
  onSaveDescription,
  onCancelDescription,
  updatePending,
}: {
  description: string | null | undefined
  canWrite: boolean
  editingDescription: boolean
  draftDescription: string
  onDraftDescriptionChange: (v: string) => void
  onSaveDescription: () => void
  onCancelDescription: () => void
  updatePending: boolean
}) {
  return (
    <Stack gap={6}>
      <Group justify="space-between">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Deskripsi
        </Text>
        {canWrite && !editingDescription && (
          <ActionIcon
            variant="subtle"
            size="xs"
            color="gray"
            onClick={() => onDraftDescriptionChange(description ?? '')}
          >
            <TbEdit size={12} />
          </ActionIcon>
        )}
      </Group>
      {editingDescription ? (
        <Stack gap="xs">
          <Textarea
            value={draftDescription}
            onChange={(e) => onDraftDescriptionChange(e.currentTarget.value)}
            autosize
            minRows={3}
            placeholder="Deskripsi, steps to reproduce, expected vs actual…"
            autoFocus
          />
          <Group justify="flex-end" gap="xs">
            <Button
              size="xs"
              variant="subtle"
              leftSection={<TbX size={12} />}
              onClick={onCancelDescription}
              disabled={updatePending}
            >
              Batal
            </Button>
            <Button
              size="xs"
              leftSection={<TbCheck size={12} />}
              onClick={onSaveDescription}
              loading={updatePending}
            >
              Simpan
            </Button>
          </Group>
        </Stack>
      ) : (
        <Text
          size="sm"
          c={description ? undefined : 'dimmed'}
          fs={description ? undefined : 'italic'}
          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
        >
          {description || 'Belum ada deskripsi'}
        </Text>
      )}
    </Stack>
  )
}
