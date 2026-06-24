import { Button, Card, Divider, Group, Stack, Text, Textarea } from '@mantine/core'
import { TbCheck, TbRefresh } from 'react-icons/tb'
import { DEFAULT_INSTRUCTION } from './constants'

export function PromptInstructionCard({
  promptInstruction,
  onPromptChange,
  promptDirty,
  onSave,
  saving,
}: {
  promptInstruction: string
  onPromptChange: (v: string) => void
  promptDirty: boolean
  onSave: () => void
  saving: boolean
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Stack gap={0}>
          <Text fw={500} size="sm">Instruksi Prompt</Text>
          <Text size="xs" c="dimmed">
            Instruksi yang dikirim ke AI untuk membentuk laporan. Gunakan{' '}
            <code style={{ fontFamily: 'monospace' }}>{'{TANGGAL}'}</code> sebagai placeholder tanggal. Kosongkan
            untuk pakai default.
          </Text>
        </Stack>
        <Divider />

        <Textarea
          value={promptInstruction}
          onChange={(e) => onPromptChange(e.currentTarget.value)}
          autosize minRows={8} maxRows={20}
          styles={{ input: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 } }}
        />

        <Group justify="space-between">
          <Button
            variant="subtle" color="gray" size="xs" leftSection={<TbRefresh size={13} />}
            onClick={() => onPromptChange(DEFAULT_INSTRUCTION)}
          >
            Reset ke default
          </Button>
          <Button leftSection={<TbCheck size={14} />} onClick={onSave} loading={saving} disabled={!promptDirty}>
            Simpan
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
