import { Badge, Group, Stack, Text } from '@mantine/core'
import { useMemo } from 'react'
import { TbCheck, TbMessage, TbPaperclip } from 'react-icons/tb'
import type { TaskDetail } from './types'

export function ActivityTimelineSection({ task }: { task: TaskDetail }) {
  const events = useMemo(() => {
    type Event = { at: string; kind: 'status' | 'comment' | 'evidence'; text: string; author: string | null }
    const out: Event[] = []
    out.push({
      at: task.createdAt,
      kind: 'status',
      text: `Created as ${task.kind} · OPEN`,
      author: task.reporter.name,
    })
    for (const s of task.statusChanges) {
      out.push({
        at: s.createdAt,
        kind: 'status',
        text: `${s.fromStatus.replace('_', ' ')} → ${s.toStatus.replace('_', ' ')}`,
        author: s.author?.name ?? null,
      })
    }
    for (const c of task.comments) {
      out.push({
        at: c.createdAt,
        kind: 'comment',
        text: c.body.length > 120 ? `${c.body.slice(0, 120)}…` : c.body,
        author: c.author.name,
      })
    }
    for (const e of task.evidence) {
      out.push({
        at: e.createdAt,
        kind: 'evidence',
        text: `${e.kind}: ${e.url}`,
        author: null,
      })
    }
    if (task.closedAt) {
      out.push({
        at: task.closedAt,
        kind: 'status',
        text: `Closed${task.actualHours != null ? ` · ${task.actualHours}h wall clock` : ''}`,
        author: task.assignee?.name ?? task.reporter.name,
      })
    }
    return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [task])

  return (
    <Stack gap="xs">
      {events.map((e) => (
        <Group
          key={`${e.kind}-${new Date(e.at).getTime()}-${e.text.slice(0, 24)}`}
          gap="xs"
          wrap="nowrap"
          align="flex-start"
        >
          <Badge
            size="xs"
            variant="light"
            color={e.kind === 'status' ? 'violet' : e.kind === 'comment' ? 'blue' : 'teal'}
            leftSection={
              e.kind === 'status' ? (
                <TbCheck size={10} />
              ) : e.kind === 'comment' ? (
                <TbMessage size={10} />
              ) : (
                <TbPaperclip size={10} />
              )
            }
          >
            {e.kind}
          </Badge>
          <div style={{ flex: 1 }}>
            <Text size="sm">{e.text}</Text>
            <Text size="xs" c="dimmed">
              {new Date(e.at).toLocaleString()}
              {e.author ? ` · ${e.author}` : ''}
            </Text>
          </div>
        </Group>
      ))}
    </Stack>
  )
}
