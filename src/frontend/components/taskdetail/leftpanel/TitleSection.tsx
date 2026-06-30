import { ActionIcon, Badge, Group, Stack, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core'
import {
  TbAlertTriangle,
  TbBulb,
  TbBug,
  TbCheck,
  TbEdit,
  TbLink,
  TbListCheck,
  TbLock,
  TbShieldCheck,
  TbTicket,
  TbX,
} from 'react-icons/tb'
import { KIND_COLOR, PRIORITY_COLOR, STATUS_COLOR } from '../constants'
import type { TaskDetail } from '../types'

export function TitleSection({
  task,
  canWrite,
  isOverdue,
  editingTitle,
  draftTitle,
  onDraftTitleChange,
  onSaveTitle,
  onCancelTitle,
  updatePending,
}: {
  task: TaskDetail
  canWrite: boolean
  isOverdue: boolean
  editingTitle: boolean
  draftTitle: string
  onDraftTitleChange: (v: string) => void
  onSaveTitle: () => void
  onCancelTitle: () => void
  updatePending: boolean
}) {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap">
      <ThemeIcon
        variant="light"
        color={KIND_COLOR[task.kind]}
        size={40}
        radius="md"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        {task.kind === 'BUG' ? (
          <TbBug size={20} />
        ) : task.kind === 'QC' ? (
          <TbShieldCheck size={20} />
        ) : task.kind === 'TICKET' ? (
          <TbTicket size={20} />
        ) : task.kind === 'IDEA' ? (
          <TbBulb size={20} />
        ) : (
          <TbListCheck size={20} />
        )}
      </ThemeIcon>
      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
        {editingTitle ? (
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <TextInput
              value={draftTitle}
              onChange={(e) => onDraftTitleChange(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onSaveTitle()
                } else if (e.key === 'Escape') onCancelTitle()
              }}
              size="sm"
              maxLength={500}
              style={{ flex: 1 }}
              autoFocus
            />
            <ActionIcon variant="light" color="blue" size="sm" onClick={onSaveTitle} loading={updatePending}>
              <TbCheck size={14} />
            </ActionIcon>
            <ActionIcon variant="subtle" size="sm" onClick={onCancelTitle} disabled={updatePending}>
              <TbX size={14} />
            </ActionIcon>
          </Group>
        ) : (
          <Group gap={6} wrap="nowrap" align="flex-start">
            <Text fw={700} size="lg" style={{ lineHeight: 1.3, flex: 1, wordBreak: 'break-word' }}>
              {task.title}
            </Text>
            {canWrite && (
              <Tooltip label="Edit judul">
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  color="gray"
                  onClick={() => onDraftTitleChange(task.title)}
                  style={{ marginTop: 3, flexShrink: 0 }}
                >
                  <TbEdit size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        )}
        <Group gap={4} wrap="wrap">
          <Badge color={KIND_COLOR[task.kind]} variant="light" size="xs">
            {task.kind}
          </Badge>
          <Badge color={STATUS_COLOR[task.status]} variant="filled" size="xs">
            {task.status.replace(/_/g, ' ')}
          </Badge>
          <Badge
            color={PRIORITY_COLOR[task.priority]}
            variant="light"
            size="xs"
            leftSection={
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: `var(--mantine-color-${PRIORITY_COLOR[task.priority]}-6)`,
                }}
              />
            }
          >
            {task.priority}
          </Badge>
          {isOverdue && (
            <Badge color="red" variant="filled" size="xs" leftSection={<TbAlertTriangle size={9} />}>
              Overdue
            </Badge>
          )}
          {task.blockedBy.length > 0 && task.status !== 'CLOSED' && (
            <Badge color="orange" variant="light" size="xs" leftSection={<TbLock size={9} />}>
              Blocked
            </Badge>
          )}
          {task.route && (
            <Badge color="gray" variant="light" size="xs" leftSection={<TbLink size={9} />}>
              {task.route}
            </Badge>
          )}
          {task.tags.map((t) => (
            <Badge key={t.tagId} color={t.tag.color} variant="dot" size="xs">
              {t.tag.name}
            </Badge>
          ))}
        </Group>
        <Text size="xs" c="dimmed">
          #{task.id.slice(0, 8)} · {task.project.name} · {task.reporter.name} ·{' '}
          {new Date(task.createdAt).toLocaleDateString('id-ID')}
        </Text>
      </Stack>
    </Group>
  )
}
