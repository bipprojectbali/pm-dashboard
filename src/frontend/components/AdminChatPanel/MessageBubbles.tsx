import { ActionIcon, Badge, Box, Card, CopyButton, Group, Loader, Text, ThemeIcon, Tooltip, TypographyStylesProvider } from '@mantine/core'
import { useEffect, useState } from 'react'
import { TbCheck, TbCopy, TbRobot, TbUser } from 'react-icons/tb'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToolCallsSection } from './ToolCallCard'
import { TYPE_COLOR, TYPE_LABEL } from './types'
import type { ChatMessage, ChatSource, ToolCall } from './types'

export function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <Group justify="flex-end" align="flex-start" gap="xs">
      <Box maw="75%">
        <Card withBorder radius="md" p="sm" bg="blue" style={{ color: '#fff' }}>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </Text>
        </Card>
      </Box>
      <ThemeIcon size="md" radius="xl" variant="filled" color="blue" style={{ flexShrink: 0, marginTop: 2 }}>
        <TbUser size={14} />
      </ThemeIcon>
    </Group>
  )
}

export function SourcesFooter({ sources }: { sources: ChatSource[] }) {
  if (!sources.length) return null
  return (
    <Box mt={6} pt={6} style={{ borderTop: '1px dashed var(--mantine-color-default-border)' }}>
      <Text size="10px" c="dimmed" mb={4} fw={600}>
        SUMBER
      </Text>
      <Group gap={4} wrap="wrap">
        {sources.map((s) => (
          <Tooltip key={s.ref} label={`${TYPE_LABEL[s.type] ?? s.type} — ${s.title}`} withArrow multiline w={240}>
            <Badge
              size="xs"
              variant="light"
              color={TYPE_COLOR[s.type] ?? 'gray'}
              radius="sm"
              style={{ textTransform: 'none', cursor: 'default' }}
            >
              [{s.ref}] {TYPE_LABEL[s.type] ?? s.type}: {s.title.length > 28 ? `${s.title.slice(0, 28)}…` : s.title}
            </Badge>
          </Tooltip>
        ))}
      </Group>
    </Box>
  )
}

// Gabungkan pesan penenang tetap dengan label fase yang berubah dari backend
// ("Menganalisis pertanyaan..." → "Mencari data..." → "Memproses data & …").
// "Mohon tunggu sebentar" selalu tampil; ekornya mengikuti fase, huruf awal
// diturunkan + trailing "..." dirapikan jadi satu elipsis.
function waitLabel(phase?: string): string {
  const base = 'Mohon tunggu sebentar'
  if (!phase) return `${base}…`
  const tail = phase.replace(/\.+$/, '').trim()
  if (!tail) return `${base}…`
  return `${base}, sedang ${tail.charAt(0).toLowerCase()}${tail.slice(1)}…`
}

// Fase "menyusun jawaban" adalah bagian terlama (AI menulis jawaban akhir,
// bisa 10–60 dtk). Backend mengirim label statis, jadi tanpa rotasi ini label
// terasa nyangkut. Deteksi via prefix "Memproses" (label iter 1+ dari backend).
const LONG_PHASE_MARKER = 'Memproses'
const ROTATING_TAILS = [
  'sedang menyusun jawaban…',
  'sedang merapikan hasil…',
  'sebentar lagi selesai…',
]
const ROTATE_INTERVAL_MS = 4000

// Indikator loading: label statis untuk fase pendek, tapi berputar tiap
// ROTATE_INTERVAL_MS saat fase panjang supaya tidak terasa macet.
function WaitIndicator({ phase }: { phase?: string }) {
  const isLongPhase = !!phase && phase.startsWith(LONG_PHASE_MARKER)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isLongPhase) return
    const id = setInterval(() => setTick((t) => t + 1), ROTATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isLongPhase])

  // Reset ke pesan pertama tiap kali masuk/keluar fase panjang.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sengaja reset saat fase berubah
  useEffect(() => { setTick(0) }, [isLongPhase])

  const label = isLongPhase
    ? `Mohon tunggu sebentar, ${ROTATING_TAILS[tick % ROTATING_TAILS.length]}`
    : waitLabel(phase)

  return (
    <Group gap="xs" align="center">
      <Loader type="dots" size="sm" color="violet" />
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Group>
  )
}

export function AssistantBubble({
  msg,
  streaming,
  toolCalls,
  phase,
}: {
  msg: { content: string; sources?: ChatSource[] }
  streaming?: boolean
  toolCalls?: ToolCall[]
  phase?: string
}) {
  return (
    <Group justify="flex-start" align="flex-start" gap="xs">
      <ThemeIcon size="md" radius="xl" variant="light" color="violet" style={{ flexShrink: 0, marginTop: 2 }}>
        <TbRobot size={14} />
      </ThemeIcon>
      <Box maw="80%" style={{ flex: 1, minWidth: 0 }}>
        <Card withBorder radius="md" p="sm" style={{ background: 'var(--mantine-color-violet-light)' }}>
          <Group justify="flex-end" mb={4} gap={4}>
            {!streaming && (
              <CopyButton value={msg.content} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Tersalin!' : 'Copy'} withArrow>
                    <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                      {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            )}
          </Group>
          {toolCalls && toolCalls.length > 0 && <ToolCallsSection calls={toolCalls} />}
          {/* Selama streaming, teks preamble AI ("Saya perlu mengumpulkan
              data…") disembunyikan — user hanya melihat loader dengan pesan
              "Mohon tunggu sebentar, …". Konten baru dirender saat jawaban
              final sudah lengkap (bubble tersimpan, streaming=false). */}
          {!streaming && msg.content && (
            <TypographyStylesProvider style={{ fontSize: 13 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </TypographyStylesProvider>
          )}
          {streaming && <WaitIndicator phase={phase} />}
          {!streaming && msg.sources && msg.sources.length > 0 && <SourcesFooter sources={msg.sources} />}
        </Card>
      </Box>
    </Group>
  )
}
