import { ActionIcon, Badge, Button, Group, Select, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { TbPlus, TbX } from 'react-icons/tb'
import { STATUS_COLOR } from './constants'
import type { TaskDetail, TaskStatus } from './types'

export function DependenciesSection({
  task,
  projectTasks,
  canWrite,
  onAdd,
  onRemove,
}: {
  task: TaskDetail
  projectTasks: Array<{ id: string; title: string; status: TaskStatus }>
  canWrite: boolean
  onAdd: (blockedById: string) => void
  onRemove: (blockedById: string) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const existingIds = new Set(task.blockedBy.map((b) => b.blockedById))
  const options = projectTasks
    .filter((t) => t.id !== task.id && !existingIds.has(t.id))
    .map((t) => ({ value: t.id, label: `${t.title} (${t.status.replace('_', ' ')})` }))

  return (
    <Stack gap="sm">
      <div>
        <Text size="xs" c="dimmed" fw={500} mb={4}>
          Blocked by
        </Text>
        {task.blockedBy.length === 0 ? (
          <Text size="xs" c="dimmed">
            Not blocked by any tasks.
          </Text>
        ) : (
          <Stack gap={4}>
            {task.blockedBy.map((b) => (
              <Group key={b.id} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <Badge size="xs" color={STATUS_COLOR[b.blockedBy.status]} variant="light">
                    {b.blockedBy.status.replace('_', ' ')}
                  </Badge>
                  <Text size="sm" truncate>
                    {b.blockedBy.title}
                  </Text>
                </Group>
                {canWrite && (
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onRemove(b.blockedById)}>
                    <TbX size={12} />
                  </ActionIcon>
                )}
              </Group>
            ))}
          </Stack>
        )}
      </div>
      {task.blocks.length > 0 && (
        <div>
          <Text size="xs" c="dimmed" fw={500} mb={4}>
            Blocks
          </Text>
          <Stack gap={4}>
            {task.blocks.map((b) => (
              <Group key={b.id} gap="xs" wrap="nowrap">
                <Badge size="xs" color={STATUS_COLOR[b.task.status]} variant="light">
                  {b.task.status.replace('_', ' ')}
                </Badge>
                <Text size="sm" truncate>
                  {b.task.title}
                </Text>
              </Group>
            ))}
          </Stack>
        </div>
      )}
      {canWrite && (
        <Group gap="xs" wrap="nowrap">
          <Select
            size="sm"
            placeholder="Pick a task that blocks this"
            data={options}
            value={picked}
            onChange={setPicked}
            searchable
            clearable
            style={{ flex: 1 }}
            nothingFoundMessage={options.length === 0 ? 'No other tasks available' : 'No match'}
          />
          <Button
            size="sm"
            leftSection={<TbPlus size={14} />}
            disabled={!picked}
            onClick={() => {
              if (picked) {
                onAdd(picked)
                setPicked(null)
              }
            }}
          >
            Add
          </Button>
        </Group>
      )}
    </Stack>
  )
}
