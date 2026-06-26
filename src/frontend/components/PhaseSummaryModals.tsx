import { Button, Group, Stack, Text, Textarea } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useState } from 'react'
import type { ProjectPhase } from './phase.types'

export function EditSummaryModal({
  phase,
  onConfirm,
}: {
  phase: ProjectPhase
  onConfirm: (summary: string | null) => void
}) {
  const [summary, setSummary] = useState(phase.summary ?? '')
  return (
    <Stack gap="sm">
      <Textarea
        label="Kesimpulan"
        placeholder="Apa yang dicapai, pelajaran yang dipetik…"
        value={summary}
        onChange={(e) => setSummary(e.currentTarget.value)}
        autosize
        minRows={4}
        data-autofocus
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Batal
        </Button>
        <Button
          color="green"
          size="xs"
          onClick={() => {
            onConfirm(summary.trim() || null)
            modals.closeAll()
          }}
        >
          Simpan
        </Button>
      </Group>
    </Stack>
  )
}

export function CompletePhaseModal({
  phaseName,
  onConfirm,
}: {
  phaseName: string
  onConfirm: (summary: string) => void
}) {
  const [summary, setSummary] = useState('')
  return (
    <Stack gap="sm">
      <Text size="sm">
        Fase <b>"{phaseName}"</b> akan ditandai selesai.
      </Text>
      <Textarea
        label="Kesimpulan (opsional)"
        placeholder="Apa yang dicapai, pelajaran yang dipetik…"
        value={summary}
        onChange={(e) => setSummary(e.currentTarget.value)}
        autosize
        minRows={3}
        data-autofocus
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Batal
        </Button>
        <Button
          color="green"
          size="xs"
          onClick={() => {
            onConfirm(summary)
            modals.closeAll()
          }}
        >
          Tandai Selesai
        </Button>
      </Group>
    </Stack>
  )
}
