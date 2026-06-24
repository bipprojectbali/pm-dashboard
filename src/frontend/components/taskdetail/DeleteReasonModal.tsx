import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'

export function DeleteReasonModal({
  taskTitle,
  onConfirm,
  onCancel,
}: {
  taskTitle: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Stack gap="sm">
      <Text size="sm">"{taskTitle}" akan dipindahkan ke Trash. Bisa di-restore dalam 30 hari.</Text>
      <TextInput
        placeholder="Tulis alasan penghapusan..."
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        data-autofocus
        autoFocus
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={onCancel}>
          Batal
        </Button>
        <Button color="red" size="xs" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>
          Hapus
        </Button>
      </Group>
    </Stack>
  )
}
