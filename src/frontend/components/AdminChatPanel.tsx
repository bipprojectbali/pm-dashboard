import { ActionIcon, Box, Button, Card, Group, ScrollArea, Stack, Text, Textarea, ThemeIcon, Tooltip } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { TbRobot, TbSend } from 'react-icons/tb'
import { ChatHeader } from './AdminChatPanel/ChatHeader'
import { AssistantBubble, UserBubble } from './AdminChatPanel/MessageBubbles'
import { QUICK_PROMPTS } from './AdminChatPanel/types'
import { useChatStream } from './AdminChatPanel/useChatStream'

export function AdminChatPanel() {
  const chat = useChatStream()
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollRef is stable ref, intentionally omitted
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chat.messages, chat.currentStream])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      chat.sendMessage(chat.input)
    }
  }

  const handleNewSession = () => {
    chat.resetSession()
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const isEmpty = chat.messages.length === 0 && !chat.isStreaming

  return (
    <Stack gap="md" style={{ height: 'calc(100vh - 160px)', minHeight: 500 }}>
      <ChatHeader
        systemContext={chat.systemContext}
        contextLoadedAt={chat.contextLoadedAt}
        totalDocuments={chat.syncStatusQ.data?.totalDocuments ?? null}
        lastSync={chat.syncStatusQ.data?.lastSync ?? null}
        docsCount={chat.docsCount}
        isStreaming={chat.isStreaming}
        syncResult={chat.syncMutation.data ?? null}
        isSyncing={chat.syncMutation.isPending}
        onRefreshContext={chat.refreshContext}
        onSync={() => chat.syncMutation.mutate()}
        onNewSession={handleNewSession}
      />

      <Group gap="xs" wrap="wrap">
        {QUICK_PROMPTS.map((p) => (
          <Button
            key={p}
            size="compact-xs"
            variant="light"
            color="violet"
            radius="xl"
            disabled={chat.isStreaming}
            onClick={() => chat.sendMessage(p)}
          >
            {p}
          </Button>
        ))}
      </Group>

      <Card withBorder radius="md" p={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ScrollArea viewportRef={scrollRef} style={{ flex: 1 }} p="md">
          {isEmpty ? (
            <Stack align="center" justify="center" gap="xs" py="xl">
              <ThemeIcon size="xl" radius="xl" variant="light" color="violet">
                <TbRobot size={28} />
              </ThemeIcon>
              <Text fw={600} c="dimmed">Tanya apapun tentang proyek</Text>
              <Text size="sm" c="dimmed" ta="center">
                Konteks DB akan dimuat otomatis saat pertama kali kamu mengirim pesan.
              </Text>
            </Stack>
          ) : (
            <Stack gap="sm">
              {chat.messages.map((msg) =>
                msg.role === 'user' ? (
                  <UserBubble key={msg.id} msg={msg} />
                ) : (
                  <AssistantBubble key={msg.id} msg={msg} toolCalls={msg.toolCalls} />
                ),
              )}
              {chat.isStreaming && (
                <AssistantBubble
                  msg={{ content: chat.currentStream, sources: chat.currentSources }}
                  toolCalls={chat.currentToolCalls}
                  phase={chat.phase}
                  streaming
                />
              )}
              {chat.error && (
                <Card withBorder radius="md" p="sm" bg="red.0">
                  <Text size="sm" c="red">{chat.error}</Text>
                </Card>
              )}
            </Stack>
          )}
        </ScrollArea>

        <Box p="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Group gap="xs" align="flex-end">
            <Textarea
              ref={textareaRef}
              placeholder="Tanya apapun... (Enter kirim, Shift+Enter baris baru)"
              value={chat.input}
              onChange={(e) => chat.setInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              disabled={chat.isStreaming}
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
                disabled={!chat.input.trim() || chat.isStreaming}
                onClick={() => chat.sendMessage(chat.input)}
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
