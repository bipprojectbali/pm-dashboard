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
// ("Menganalisis pertanyaan..." → "Mencari data..." → "Menyusun jawaban...").
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
// 10–60 dtk). Backend mengirim satu label statis untuk fase ini, jadi tanpa
// bantuan terasa nyangkut. Deteksi via prefix "Menyusun" (label iter 1+).
const LONG_PHASE_MARKER = 'Menyusun'
// Progresi MAJU-LALU-BERHENTI (bukan loop): tiap step tampil ROTATE_STEP_MS,
// lalu diam di pesan terakhir sampai AI selesai. Bukan rotasi tak-berujung.
const PROGRESS_TAILS = [
  'sedang mencari data…',
  'sedang memproses data…',
  'sedang menyusun jawaban…',
]
const ROTATE_STEP_MS = 4000

// Indikator loading: fase pendek pakai label backend apa adanya; fase panjang
// berjalan maju melalui PROGRESS_TAILS lalu berhenti di step terakhir.
function WaitIndicator({ phase }: { phase?: string }) {
  const isLongPhase = !!phase && phase.startsWith(LONG_PHASE_MARKER)
  const [step, setStep] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: sengaja reset saat masuk/keluar fase panjang
  useEffect(() => {
    setStep(0)
    if (!isLongPhase) return
    // Maju satu step tiap interval, berhenti di step terakhir (tak me-loop).
    const id = setInterval(() => {
      setStep((s) => (s < PROGRESS_TAILS.length - 1 ? s + 1 : s))
    }, ROTATE_STEP_MS)
    return () => clearInterval(id)
  }, [isLongPhase])

  const label = isLongPhase ? `Mohon tunggu sebentar, ${PROGRESS_TAILS[step]}` : waitLabel(phase)

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
