import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Collapse,
  CopyButton,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
  TypographyStylesProvider,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TbAlertTriangle,
  TbBrain,
  TbCheck,
  TbChevronDown,
  TbChevronRight,
  TbClockBolt,
  TbCopy,
  TbDatabase,
  TbMessageCircle,
  TbRefresh,
  TbRobot,
  TbSend,
  TbUser,
} from 'react-icons/tb'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatSource {
  ref: string
  type: string
  entityId: string
  title: string
}

interface ToolCall {
  id: string
  name: string
  input: unknown
  result?: { ok: boolean; error?: string; rows?: unknown[]; summary?: Record<string, unknown>; truncated?: boolean }
  pending?: boolean
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  toolCalls?: ToolCall[]
}

const TOOL_LABEL: Record<string, string> = {
  query_users: 'Cari User',
  query_tasks: 'Query Task',
  query_project_detail: 'Detail Proyek',
  query_github_activity: 'Aktivitas GitHub',
  query_effort: 'Effort Tracking',
}

const QUICK_PROMPTS = [
  'Proyek mana yang paling berisiko?',
  'Siapa yang paling banyak commit minggu ini?',
  'Task mana yang overbudget?',
  'Siapa yang paling overloaded?',
  'Task overdue apa saja?',
  'Events mendatang minggu ini?',
]

const TYPE_LABEL: Record<string, string> = {
  user: 'User',
  task: 'Task',
  project: 'Project',
  event: 'Event',
  comment: 'Komentar',
  github_project: 'GitHub',
  effort_user: 'Effort',
  effort_task: 'Effort Task',
  ghost_task: 'Ghost',
  milestone: 'Milestone',
  extension: 'Extension',
  dependency: 'Blocker',
  evidence: 'Evidence',
  audit_recent: 'Audit',
  agent_status: 'Agent',
  report_history: 'Laporan',
  project_retro: 'Retro',
}

const TYPE_COLOR: Record<string, string> = {
  user: 'blue',
  task: 'cyan',
  project: 'grape',
  event: 'orange',
  comment: 'gray',
  github_project: 'dark',
  effort_user: 'lime',
  effort_task: 'lime',
  ghost_task: 'red',
  milestone: 'indigo',
  extension: 'pink',
  dependency: 'yellow',
  evidence: 'teal',
  audit_recent: 'gray',
  agent_status: 'violet',
  report_history: 'blue',
  project_retro: 'grape',
}

function formatAge(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return 'baru saja'
  if (sec < 3600) return `${Math.floor(sec / 60)}m lalu`
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h lalu`
  return `${Math.floor(sec / 86_400)}d lalu`
}

function UserBubble({ msg }: { msg: ChatMessage }) {
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

function SourcesFooter({ sources }: { sources: ChatSource[] }) {
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

function ToolCallCard({ call }: { call: ToolCall }) {
  const [opened, { toggle }] = useDisclosure(false)
  const ok = call.result?.ok
  const summary = call.result?.summary
  const rowCount = call.result?.rows?.length ?? 0
  const truncated = call.result?.truncated

  let statusBadge: { color: string; text: string }
  if (call.pending) statusBadge = { color: 'gray', text: 'menjalankan…' }
  else if (ok === false) statusBadge = { color: 'red', text: 'error' }
  else if (rowCount === 0) statusBadge = { color: 'yellow', text: 'kosong' }
  else statusBadge = { color: 'teal', text: `${rowCount} row${truncated ? '+' : ''}` }

  return (
    <Card withBorder radius="sm" p={6} mb={6} style={{ background: 'var(--mantine-color-gray-light)' }}>
      <Group gap={6} wrap="nowrap" onClick={toggle} style={{ cursor: 'pointer' }}>
        <ThemeIcon size={18} radius="sm" variant="light" color={ok === false ? 'red' : 'cyan'}>
          {ok === false ? <TbAlertTriangle size={11} /> : <TbDatabase size={11} />}
        </ThemeIcon>
        <Text size="xs" fw={600} style={{ flex: 1 }}>
          {TOOL_LABEL[call.name] ?? call.name}
        </Text>
        <Badge size="xs" color={statusBadge.color} variant="light">
          {statusBadge.text}
        </Badge>
        {opened ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
      </Group>
      <Collapse in={opened}>
        <Stack gap={6} mt={6}>
          <Box>
            <Text size="10px" c="dimmed" fw={600}>
              INPUT
            </Text>
            <Code block style={{ fontSize: 10 }}>
              {JSON.stringify(call.input, null, 2)}
            </Code>
          </Box>
          {call.result && (
            <Box>
              <Text size="10px" c="dimmed" fw={600}>
                HASIL
              </Text>
              {call.result.error ? (
                <Text size="xs" c="red">
                  {call.result.error}
                </Text>
              ) : (
                <>
                  {summary && (
                    <Code block style={{ fontSize: 10 }}>
                      {JSON.stringify(summary, null, 2)}
                    </Code>
                  )}
                  {rowCount > 0 && (
                    <Text size="10px" c="dimmed" mt={4}>
                      {rowCount} row {truncated ? '(terpotong)' : ''}
                    </Text>
                  )}
                </>
              )}
            </Box>
          )}
        </Stack>
      </Collapse>
    </Card>
  )
}

function ToolCallsSection({ calls }: { calls: ToolCall[] }) {
  if (!calls.length) return null
  return (
    <Box mb={6}>
      <Text size="10px" c="dimmed" fw={600} mb={4}>
        DIVERIFIKASI DARI {calls.length} TOOL CALL
      </Text>
      {calls.map((c) => (
        <ToolCallCard key={c.id} call={c} />
      ))}
    </Box>
  )
}

function AssistantBubble({
  msg,
  streaming,
  toolCalls,
}: {
  msg: { content: string; sources?: ChatSource[] }
  streaming?: boolean
  toolCalls?: ToolCall[]
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
          <TypographyStylesProvider style={{ fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content + (streaming ? '▋' : '')}</ReactMarkdown>
          </TypographyStylesProvider>
          {!streaming && msg.sources && msg.sources.length > 0 && <SourcesFooter sources={msg.sources} />}
        </Card>
      </Box>
    </Group>
  )
}

export function AdminChatPanel() {
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [systemContext, setSystemContext] = useState<string | null>(null)
  const [contextLoadedAt, setContextLoadedAt] = useState<Date | null>(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStream, setCurrentStream] = useState('')
  const [currentSources, setCurrentSources] = useState<ChatSource[]>([])
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([])
  const [phase, setPhase] = useState('')
  const [docsCount, setDocsCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0) // re-render every 30s for freshness label
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const syncStatusQ = useQuery<{ totalDocuments: number; lastSync: string | null }>({
    queryKey: ['admin', 'chat', 'sync-status'],
    queryFn: () => fetch('/api/admin/chat/sync/status', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 5 * 60_000,
  })

  const syncMutation = useMutation({
    mutationFn: () =>
      fetch('/api/admin/chat/sync', { method: 'POST', credentials: 'include' }).then((r) => r.json()) as Promise<{
        ok: boolean
        synced: number
        pruned: number
        failedEmbeddings: number
        duration: number
      }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'chat', 'sync-status'] }),
  })

  // tick clock every 30s so "X menit lalu" stays accurate
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollRef is stable ref, intentionally omitted
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, currentStream])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setIsStreaming(true)
      setCurrentStream('')
      setCurrentSources([])
      setCurrentToolCalls([])
      setPhase('')
      setDocsCount(0)
      setError(null)

      try {
        const res = await fetch('/api/admin/chat/stream', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
            systemContext,
          }),
        })
        if (!res.ok) {
          setError(`HTTP ${res.status}`)
          return
        }

        const reader = res.body!.getReader()
        const dec = new TextDecoder()
        let buf = ''
        let accumulated = ''
        let newContext: string | null = null
        let collectedSources: ChatSource[] = []
        let collectedToolCalls: ToolCall[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })

          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''

          for (const part of parts) {
            let eventName = ''
            let eventData = ''
            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim()
              if (line.startsWith('data: ')) eventData = line.slice(6).trim()
            }
            if (!eventData) continue
            try {
              const data = JSON.parse(eventData)
              if (eventName === 'system') newContext = data.context
              else if (eventName === 'phase') setPhase(data.label)
              else if (eventName === 'docs') setDocsCount(data.count)
              else if (eventName === 'sources') {
                collectedSources = data.sources ?? []
                setCurrentSources(collectedSources)
              } else if (eventName === 'tool_use') {
                const newCall: ToolCall = { id: data.id, name: data.name, input: data.input, pending: true }
                collectedToolCalls = [...collectedToolCalls, newCall]
                setCurrentToolCalls(collectedToolCalls)
              } else if (eventName === 'tool_result') {
                collectedToolCalls = collectedToolCalls.map((c) =>
                  c.id === data.id ? { ...c, pending: false, result: data.result } : c,
                )
                setCurrentToolCalls(collectedToolCalls)
              } else if (eventName === 'token') {
                accumulated += data.text
                setCurrentStream(accumulated)
              } else if (eventName === 'done') {
                const final = data.full || accumulated
                const finalSources = (data.sources as ChatSource[] | undefined) ?? collectedSources
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: final,
                    sources: finalSources,
                    toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
                  },
                ])
                setCurrentStream('')
                setCurrentSources([])
                setCurrentToolCalls([])
                if (newContext) {
                  setSystemContext(newContext)
                  setContextLoadedAt(new Date())
                }
              } else if (eventName === 'error') setError(data.message)
            } catch {
              /* ignore */
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Koneksi gagal')
      } finally {
        setIsStreaming(false)
        setCurrentStream('')
        setCurrentSources([])
        setCurrentToolCalls([])
        setPhase('')
      }
    },
    [messages, systemContext, isStreaming],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleNewSession = () => {
    setMessages([])
    setSystemContext(null)
    setContextLoadedAt(null)
    setCurrentStream('')
    setCurrentSources([])
    setCurrentToolCalls([])
    setError(null)
    setPhase('')
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  // Refresh context only — keep history. Next message will rebuild systemContext on server.
  const handleRefreshContext = () => {
    setSystemContext(null)
    setContextLoadedAt(null)
  }

  const isEmpty = messages.length === 0 && !isStreaming

  return (
    <Stack gap="md" style={{ height: 'calc(100vh - 160px)', minHeight: 500 }}>
      {/* Header */}
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ThemeIcon size="md" variant="light" color="violet">
            <TbMessageCircle size={16} />
          </ThemeIcon>
          <div>
            <Text fw={600} size="sm">
              Chat AI
            </Text>
            <Text size="xs" c="dimmed">
              Tanya langsung tentang proyek, task, dan tim.
            </Text>
          </div>
          {systemContext && contextLoadedAt && (
            <Tooltip
              label="Konteks live (KPI, roster, GitHub, effort) di-load saat pesan pertama. Klik tombol Refresh Konteks untuk segarkan tanpa kehilangan history."
              withArrow
              multiline
              w={260}
            >
              <Badge size="xs" color="teal" variant="light" leftSection={<TbClockBolt size={10} />}>
                Konteks {formatAge(contextLoadedAt)}
              </Badge>
            </Tooltip>
          )}
          {syncStatusQ.data?.totalDocuments != null && (
            <Tooltip
              label={`Knowledge base: ${syncStatusQ.data.totalDocuments} dokumen${syncStatusQ.data.lastSync ? ` | Sync: ${new Date(syncStatusQ.data.lastSync).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`}
              withArrow
            >
              <Badge size="xs" color="violet" variant="light" leftSection={<TbBrain size={10} />}>
                {syncStatusQ.data.totalDocuments} dok
              </Badge>
            </Tooltip>
          )}
          {docsCount > 0 && isStreaming && (
            <Badge size="xs" color="orange" variant="light">
              {docsCount} dok relevan
            </Badge>
          )}
          {syncMutation.data && !syncMutation.isPending && (
            <Tooltip
              label={`Sync terakhir: +${syncMutation.data.synced} synced, −${syncMutation.data.pruned} pruned${syncMutation.data.failedEmbeddings > 0 ? `, ⚠️ ${syncMutation.data.failedEmbeddings} embed gagal` : ''} (${(syncMutation.data.duration / 1000).toFixed(1)}s)`}
              withArrow
              multiline
              w={260}
            >
              <Badge size="xs" color="gray" variant="outline">
                +{syncMutation.data.synced} / −{syncMutation.data.pruned}
              </Badge>
            </Tooltip>
          )}
        </Group>
        <Group gap="xs">
          {systemContext && (
            <Tooltip label="Segarkan konteks live (KPI, roster) — history dipertahankan" withArrow>
              <Button
                size="xs"
                variant="subtle"
                color="teal"
                leftSection={<TbRefresh size={13} />}
                onClick={handleRefreshContext}
                disabled={isStreaming}
              >
                Refresh Konteks
              </Button>
            </Tooltip>
          )}
          <Tooltip label="Perbarui knowledge base (sync semua dokumen ke AI)" withArrow>
            <Button
              size="xs"
              variant="subtle"
              color="violet"
              leftSection={syncMutation.isPending ? <Loader size={11} /> : <TbBrain size={13} />}
              onClick={() => syncMutation.mutate()}
              disabled={isStreaming || syncMutation.isPending}
            >
              {syncMutation.isPending ? 'Menyinkron...' : 'Perbarui Pengetahuan'}
            </Button>
          </Tooltip>
          <Tooltip label="Sesi baru — bersihkan percakapan & refresh konteks" withArrow>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<TbRefresh size={13} />}
              onClick={handleNewSession}
              disabled={isStreaming}
            >
              Sesi Baru
            </Button>
          </Tooltip>
        </Group>
      </Group>

      {/* Quick prompts */}
      <Group gap="xs" wrap="wrap">
        {QUICK_PROMPTS.map((p) => (
          <Button
            key={p}
            size="compact-xs"
            variant="light"
            color="violet"
            radius="xl"
            disabled={isStreaming}
            onClick={() => sendMessage(p)}
          >
            {p}
          </Button>
        ))}
      </Group>

      {/* Messages */}
      <Card
        withBorder
        radius="md"
        p={0}
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <ScrollArea viewportRef={scrollRef} style={{ flex: 1 }} p="md">
          {isEmpty ? (
            <Stack align="center" justify="center" gap="xs" py="xl">
              <ThemeIcon size="xl" radius="xl" variant="light" color="violet">
                <TbRobot size={28} />
              </ThemeIcon>
              <Text fw={600} c="dimmed">
                Tanya apapun tentang proyek
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Konteks DB akan dimuat otomatis saat pertama kali kamu mengirim pesan.
              </Text>
            </Stack>
          ) : (
            <Stack gap="sm">
              {messages.map((msg) =>
                msg.role === 'user' ? (
                  <UserBubble key={msg.id} msg={msg} />
                ) : (
                  <AssistantBubble key={msg.id} msg={msg} toolCalls={msg.toolCalls} />
                ),
              )}
              {isStreaming && currentStream && (
                <AssistantBubble
                  msg={{ content: currentStream, sources: currentSources }}
                  toolCalls={currentToolCalls}
                  streaming
                />
              )}
              {isStreaming && !currentStream && (
                <Group justify="flex-start" align="flex-start" gap="xs">
                  <ThemeIcon
                    size="md"
                    radius="xl"
                    variant="light"
                    color="violet"
                    style={{ flexShrink: 0, marginTop: 2 }}
                  >
                    <TbRobot size={14} />
                  </ThemeIcon>
                  <Card
                    withBorder
                    radius="md"
                    p="sm"
                    style={{ background: 'var(--mantine-color-violet-light)', minWidth: 80, flex: 1 }}
                  >
                    <Stack gap={4} align="stretch">
                      {currentToolCalls.length > 0 && <ToolCallsSection calls={currentToolCalls} />}
                      <Loader type="dots" size="sm" color="violet" />
                      {phase && (
                        <Text size="xs" c="dimmed">
                          {phase}
                        </Text>
                      )}
                    </Stack>
                  </Card>
                </Group>
              )}
              {error && (
                <Card withBorder radius="md" p="sm" bg="red.0">
                  <Text size="sm" c="red">
                    {error}
                  </Text>
                </Card>
              )}
            </Stack>
          )}
        </ScrollArea>

        {/* Input */}
        <Box p="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Group gap="xs" align="flex-end">
            <Textarea
              ref={textareaRef}
              placeholder="Tanya apapun... (Enter kirim, Shift+Enter baris baru)"
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              autosize
              minRows={1}
              maxRows={4}
              style={{ flex: 1 }}
              styles={{ input: { resize: 'none' } }}
            />
            <Tooltip label="Kirim (Enter)" withArrow>
              <ActionIcon
                size="lg"
                variant="filled"
                color="violet"
                disabled={!input.trim() || isStreaming}
                onClick={() => sendMessage(input)}
              >
                <TbSend size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
      </Card>
    </Stack>
  )
}
