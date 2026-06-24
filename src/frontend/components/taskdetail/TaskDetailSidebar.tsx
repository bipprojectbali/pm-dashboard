import {
  Button,
  Divider,
  Group,
  Select,
  Stack,
  Text,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { TbCalendarEvent } from 'react-icons/tb'
import { UserAvatar } from '../shared/UserAvatar'
import { STATUS_COLOR } from './constants'
import { EstimateField } from './EstimateField'
import { HoursProgressCard } from './HoursProgressCard'
import { allowedTransitions } from './helpers'
import { TagsPicker } from './TagsPicker'
import type { ProjectDetail, ProjectMemberRole, TagListItem, TaskDetail, TaskPriority } from './types'

export function TaskDetailSidebar({
  task,
  canWrite,
  projectMembers,
  phases,
  tags,
  isOverdue,
  updatePending,
  updateError,
  onUpdate,
  onCreateTag,
  creatingTag,
}: {
  task: TaskDetail
  canWrite: boolean
  projectMembers: ProjectDetail['members']
  phases: Array<{ id: string; title: string; status: string }>
  tags: TagListItem[]
  isOverdue: boolean
  updatePending: boolean
  updateError: Error | null
  onUpdate: (body: Partial<{
    status: TaskDetail['status']
    priority: TaskPriority
    assigneeId: string | null
    phaseId: string | null
    startsAt: string | null
    dueAt: string | null
    estimateHours: number | null
    progressPercent: number | null
    tagIds: string[]
  }>) => void
  onCreateTag: (name: string) => void
  creatingTag: boolean
}) {
  const transitions = allowedTransitions(task.status, task.kind)

  return (
    <Stack gap="md" p="md" style={{ minWidth: 0 }}>
      {/* Status transitions */}
      {canWrite && transitions.length > 0 && (
        <Stack gap={6}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
            Ubah Status
          </Text>
          <Group gap="xs" wrap="wrap">
            {transitions.map((s) => (
              <Button
                key={s}
                size="xs"
                variant="light"
                color={STATUS_COLOR[s]}
                onClick={() => onUpdate({ status: s })}
                loading={updatePending}
                leftSection={
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: `var(--mantine-color-${STATUS_COLOR[s]}-6)`,
                    }}
                  />
                }
              >
                {s.replace(/_/g, ' ')}
              </Button>
            ))}
          </Group>
          {updateError && (
            <Text size="xs" c="red">
              {updateError.message}
            </Text>
          )}
        </Stack>
      )}

      {/* Settings */}
      {canWrite && (
        <Stack gap="sm">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
            Pengaturan
          </Text>
          <Select
            label="Prioritas"
            size="xs"
            data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
            value={task.priority}
            onChange={(v) => v && onUpdate({ priority: v as TaskPriority })}
          />
          <Select
            label="Assignee"
            size="xs"
            placeholder="Tidak ada"
            clearable
            data={projectMembers.map((m) => ({
              value: m.user.id,
              label: `${m.user.name} · ${m.role}`,
            }))}
            value={task.assignee?.id ?? null}
            onChange={(v) => onUpdate({ assigneeId: v })}
            leftSection={
              task.assignee ? (
                <UserAvatar name={task.assignee.name} image={task.assignee.image} size={16} color="blue" />
              ) : undefined
            }
          />
          {phases.length > 0 && (
            <Select
              label="Fase"
              size="xs"
              placeholder="Tanpa fase"
              clearable
              data={phases.map((p) => ({ value: p.id, label: p.title }))}
              value={task.phaseId ?? null}
              onChange={(v) => onUpdate({ phaseId: v })}
            />
          )}
        </Stack>
      )}

      {/* People */}
      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          People
        </Text>
        <Group gap="xs" wrap="nowrap">
          <UserAvatar name={task.reporter.name} image={task.reporter.image} size={26} color="gray" />
          <Stack gap={0}>
            <Text size="xs" fw={500}>
              {task.reporter.name}
            </Text>
            <Text size="xs" c="dimmed">
              Reporter
            </Text>
          </Stack>
        </Group>
        {task.assignee && (
          <Group gap="xs" wrap="nowrap">
            <UserAvatar name={task.assignee.name} image={task.assignee.image} size={26} color="blue" />
            <Stack gap={0}>
              <Text size="xs" fw={500}>
                {task.assignee.name}
              </Text>
              <Text size="xs" c="dimmed">
                Assignee
              </Text>
            </Stack>
          </Group>
        )}
      </Stack>

      <Divider />

      {/* Planning */}
      <Stack gap="sm">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Planning
        </Text>
        {canWrite ? (
          <Stack gap="xs">
            <DateInput
              highlightToday
              label="Mulai"
              placeholder="Opsional"
              size="xs"
              clearable
              leftSection={<TbCalendarEvent size={13} />}
              value={task.startsAt ? new Date(task.startsAt) : null}
              onChange={(v) =>
                onUpdate({ startsAt: v ? new Date(v as unknown as string).toISOString() : null })
              }
            />
            <DateInput
              highlightToday
              label="Tenggat"
              placeholder="Opsional"
              size="xs"
              clearable
              leftSection={<TbCalendarEvent size={13} />}
              value={task.dueAt ? new Date(task.dueAt) : null}
              onChange={(v) =>
                onUpdate({ dueAt: v ? new Date(v as unknown as string).toISOString() : null })
              }
            />
            <EstimateField
              value={task.estimateHours}
              onCommit={(v) => onUpdate({ estimateHours: v })}
            />
          </Stack>
        ) : (
          <Stack gap={4}>
            {task.startsAt && (
              <Group gap={6}>
                <TbCalendarEvent size={13} />
                <Text size="xs">{new Date(task.startsAt).toLocaleDateString('id-ID')}</Text>
                <Text size="xs" c="dimmed">
                  mulai
                </Text>
              </Group>
            )}
            {task.dueAt && (
              <Group gap={6}>
                <TbCalendarEvent size={13} />
                <Text size="xs" c={isOverdue ? 'red' : undefined}>
                  {new Date(task.dueAt).toLocaleDateString('id-ID')}
                </Text>
                <Text size="xs" c="dimmed">
                  tenggat
                </Text>
              </Group>
            )}
            {!task.startsAt && !task.dueAt && (
              <Text size="xs" c="dimmed" fs="italic">
                Belum ada jadwal
              </Text>
            )}
          </Stack>
        )}
      </Stack>

      {/* Tags */}
      {canWrite && (
        <Stack gap={6}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
            Tags
          </Text>
          <TagsPicker
            projectId={task.projectId}
            currentTagIds={task.tags.map((t) => t.tagId)}
            availableTags={tags}
            onChange={(tagIds) => onUpdate({ tagIds })}
            onCreate={onCreateTag}
            creating={creatingTag}
          />
        </Stack>
      )}

      <Divider />

      <HoursProgressCard task={task} />
    </Stack>
  )
}
