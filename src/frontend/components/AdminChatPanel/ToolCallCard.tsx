import { Badge, Box, Card, Code, Collapse, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { TbAlertTriangle, TbChevronDown, TbChevronRight, TbDatabase } from 'react-icons/tb'
import { TOOL_LABEL } from './types'
import type { ToolCall } from './types'

export function ToolCallCard({ call }: { call: ToolCall }) {
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

export function ToolCallsSection({ calls }: { calls: ToolCall[] }) {
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
