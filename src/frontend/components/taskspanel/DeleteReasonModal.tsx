import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useState } from 'react'

export function DeleteReasonModal({ onConfirm, label }: { onConfirm: (reason: string) => void; label: string }) {
  const [reason, setReason] = useState('')
  return (
    <Stack gap="sm">
      <Text size="sm">{label}</Text>
      <TextInput
        placeholder="Tulis alasan penghapusan..."
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        autoFocus
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Batal
        </Button>
        <Button
          color="red"
          size="xs"
          disabled={reason.trim().length < 3}
          onClick={() => {
            onConfirm(reason.trim())
            modals.closeAll()
          }}
        >
          Hapus
        </Button>
      </Group>
    </Stack>
  )
}
