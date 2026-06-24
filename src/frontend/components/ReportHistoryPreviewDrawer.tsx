import {
  Badge,
  Button,
  CopyButton,
  Drawer,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TypographyStylesProvider,
} from '@mantine/core'
import { useState } from 'react'
import { TbCheck, TbCopy } from 'react-icons/tb'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
type SendTrigger = 'cron' | 'manual' | 'custom'

export interface HistoryEntry {
  id: string
  sentAt: string
  ok: boolean
  message: string
  trigger: SendTrigger
  markdown?: string | null
}

export const TRIGGER_COLOR: Record<string, string> = { cron: 'blue', manual: 'violet', custom: 'teal' }
export const TRIGGER_LABEL: Record<string, string> = { cron: 'Otomatis', manual: 'Manual', custom: 'Custom' }

export function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type PreviewMode = 'normal' | 'markdown'

interface PreviewDrawerProps {
  entry: HistoryEntry | null
  onClose: () => void
}

export function PreviewDrawer({ entry, onClose }: PreviewDrawerProps) {
  const [mode, setMode] = useState<PreviewMode>('normal')
  return (
    <Drawer
      opened={!!entry}
      onClose={onClose}
      title={
        entry ? (
          <Stack gap={2}>
            <Text fw={600} size="sm">
              Preview Laporan
            </Text>
            <Group gap={6}>
              <Text size="xs" c="dimmed">
                {entry ? fmtTs(entry.sentAt) : ''}
              </Text>
              <Badge size="xs" variant="light" color={TRIGGER_COLOR[entry.trigger] ?? 'gray'}>
                {TRIGGER_LABEL[entry.trigger] ?? entry.trigger}
              </Badge>
              <Badge size="xs" variant="light" color={entry.ok ? 'teal' : 'red'}>
                {entry.ok ? 'OK' : 'Gagal'}
              </Badge>
            </Group>
          </Stack>
        ) : null
      }
      position="right"
      size="xl"
      padding="md"
    >
      {entry?.markdown && (
        <Stack gap="sm" style={{ height: '100%' }}>
          <Group justify="space-between">
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => setMode(v as PreviewMode)}
              data={[
                { value: 'normal', label: 'Normal' },
                { value: 'markdown', label: 'Markdown' },
              ]}
            />
            <CopyButton value={entry.markdown} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  size="xs"
                  variant="light"
                  color={copied ? 'teal' : 'blue'}
                  leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                  onClick={copy}
                >
                  {copied ? 'Tersalin!' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>

          {mode === 'normal' ? (
            <ScrollArea style={{ flex: 1 }} type="auto">
              <TypographyStylesProvider>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.markdown}</ReactMarkdown>
              </TypographyStylesProvider>
            </ScrollArea>
          ) : (
            <Textarea
              value={entry.markdown}
              readOnly
              autosize
              minRows={20}
              maxRows={50}
              styles={{ input: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 } }}
            />
          )}
        </Stack>
      )}
    </Drawer>
  )
}
