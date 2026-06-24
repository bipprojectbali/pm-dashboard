import {
  ActionIcon,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  Loader,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { TbCheck, TbCopy, TbEye, TbRefresh, TbRobot, TbSend } from 'react-icons/tb'

export function PreviewSendCard({
  apiKeySet, apiKey, model,
  isStreaming, streamPhase, streamError, elapsed, streamingText,
  rawPrompt, preview, editedReport, onEditReport,
  onStartStream, onFetchPrompt, fetchingPrompt,
  onSendNow, sendingNow,
  onSendCustom, sendingCustom,
}: {
  apiKeySet: boolean; apiKey: string; model: string
  isStreaming: boolean; streamPhase: string | null; streamError: string | null
  elapsed: number; streamingText: string
  rawPrompt: string | null; preview: string | null; editedReport: string | null
  onEditReport: (v: string | null) => void
  onStartStream: () => void
  onFetchPrompt: () => void; fetchingPrompt: boolean
  onSendNow: () => void; sendingNow: boolean
  onSendCustom: (text: string) => void; sendingCustom: boolean
}) {
  const canUseAi = apiKeySet || !!apiKey
  const hasOutput = !!(preview || editedReport !== null || streamingText)

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={0}>
            <Text fw={500} size="sm">Preview & Kirim</Text>
            <Text size="xs" c="dimmed">Lihat data mentah, generate laporan AI, edit hasilnya, lalu kirim ke Telegram.</Text>
          </Stack>
          <Group gap="xs">
            <Button
              variant="light" color="gray" size="xs" leftSection={<TbEye size={13} />}
              onClick={onFetchPrompt} loading={fetchingPrompt}
            >
              Lihat Prompt
            </Button>
            <Button
              variant="light" color="violet" size="xs"
              leftSection={isStreaming ? <Loader size={13} color="violet" /> : <TbRobot size={13} />}
              onClick={onStartStream} disabled={isStreaming || !canUseAi}
            >
              {isStreaming ? `Generate AI (${elapsed}s)` : 'Generate AI'}
            </Button>
            <Button
              variant="light" color="blue" size="xs" leftSection={<TbSend size={13} />}
              onClick={onSendNow} loading={sendingNow} disabled={!canUseAi}
            >
              Kirim Otomatis
            </Button>
          </Group>
        </Group>

        {(isStreaming || streamError) && (
          <Group
            gap="sm" p="sm"
            style={{
              background: streamError ? 'var(--mantine-color-red-light)' : 'var(--mantine-color-violet-light)',
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          >
            {isStreaming && <Loader size="xs" color="violet" />}
            <Text size="xs" fw={500} c={streamError ? 'red' : 'violet'} style={{ flex: 1 }}>
              {streamError ?? streamPhase ?? '...'}
            </Text>
            {isStreaming && <Text size="xs" c="dimmed" ff="monospace">{elapsed}s</Text>}
          </Group>
        )}

        {(rawPrompt || hasOutput) && (
          <div style={{ display: 'grid', gridTemplateColumns: rawPrompt ? '1fr 1fr' : '1fr', gap: 12 }}>
            {rawPrompt && (
              <Stack gap={4}>
                <Group gap="xs" justify="space-between">
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">Data Mentah (Prompt)</Text>
                  <CopyButton value={rawPrompt} timeout={2000}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Disalin!' : 'Salin'} withArrow>
                        <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                          {copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
                <Textarea
                  value={rawPrompt} readOnly autosize minRows={14} maxRows={30}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 } }}
                />
              </Stack>
            )}

            {hasOutput && (
              <Stack gap={4}>
                <Group gap="xs" justify="space-between">
                  <Group gap={6}>
                    <Text size="xs" fw={600} c="dimmed" tt="uppercase">Hasil AI</Text>
                    <Badge size="xs" variant="light" color="violet">{model}</Badge>
                    {editedReport !== null && editedReport !== preview && (
                      <Badge size="xs" variant="light" color="orange">diedit</Badge>
                    )}
                  </Group>
                  <Group gap={4}>
                    <CopyButton value={editedReport ?? preview ?? ''} timeout={2000}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Disalin!' : 'Salin'} withArrow>
                          <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                            {copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    {editedReport !== null && editedReport !== preview && (
                      <Tooltip label="Reset ke hasil AI" withArrow>
                        <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => onEditReport(preview)}>
                          <TbRefresh size={12} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
                <Textarea
                  value={streamingText ? `${streamingText}▋` : (editedReport ?? preview ?? '')}
                  onChange={(e) => !isStreaming && onEditReport(e.currentTarget.value)}
                  readOnly={isStreaming} autosize minRows={14} maxRows={30}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, opacity: isStreaming ? 0.85 : 1 } }}
                />
                <Group justify="flex-end">
                  <Button
                    color="teal" size="xs" leftSection={<TbSend size={13} />}
                    onClick={() => onSendCustom(editedReport ?? preview ?? '')}
                    loading={sendingCustom} disabled={!(editedReport ?? preview)}
                  >
                    Kirim Laporan Ini
                  </Button>
                </Group>
              </Stack>
            )}
          </div>
        )}
      </Stack>
    </Card>
  )
}
