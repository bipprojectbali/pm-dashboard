import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
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
import { useCallback, useEffect, useRef, useState } from 'react'
import { TbCheck, TbCopy, TbMessageCircle, TbRefresh, TbRobot, TbSend, TbUser } from 'react-icons/tb'
import ReactMarkdown from 'react-markdown'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS = [
  'Proyek mana yang paling berisiko?',
  'Siapa yang paling overloaded?',
  'Task overdue apa saja?',
  'Aktivitas tim 7 hari terakhir',
  'Events mendatang minggu ini?',
]

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

function AssistantBubble({ msg, streaming }: { msg: { content: string }; streaming?: boolean }) {
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
          <TypographyStylesProvider style={{ fontSize: 13 }}>
            <ReactMarkdown>{msg.content + (streaming ? '▋' : '')}</ReactMarkdown>
          </TypographyStylesProvider>
        </Card>
      </Box>
    </Group>
  )
}

export function AdminChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [systemContext, setSystemContext] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStream, setCurrentStream] = useState('')
  const [phase, setPhase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      setPhase('')
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
              else if (eventName === 'token') {
                accumulated += data.text
                setCurrentStream(accumulated)
              } else if (eventName === 'done') {
                const final = data.full || accumulated
                setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: final }])
                setCurrentStream('')
                if (newContext) setSystemContext(newContext)
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
    setCurrentStream('')
    setError(null)
    setPhase('')
    setTimeout(() => textareaRef.current?.focus(), 0)
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
          {systemContext && (
            <Badge size="xs" color="teal" variant="light">
              Konteks aktif
            </Badge>
          )}
        </Group>
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
                  <AssistantBubble key={msg.id} msg={msg} />
                ),
              )}
              {isStreaming && currentStream && <AssistantBubble msg={{ content: currentStream }} streaming />}
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
                    style={{ background: 'var(--mantine-color-violet-light)', minWidth: 80 }}
                  >
                    <Stack gap={4} align="flex-start">
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
