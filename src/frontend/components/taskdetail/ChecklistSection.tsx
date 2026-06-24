import { ActionIcon, Button, Checkbox, Group, Progress, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { TbPlus, TbTrash } from 'react-icons/tb'
import type { ChecklistItem } from './types'

export function ChecklistSection({
  items,
  canWrite,
  onToggle,
  onAdd,
  onRemove,
  adding,
}: {
  items: ChecklistItem[]
  canWrite: boolean
  onToggle: (id: string, done: boolean) => void
  onAdd: (title: string) => void
  onRemove: (id: string) => void
  adding: boolean
}) {
  const [title, setTitle] = useState('')
  const done = items.filter((i) => i.done).length

  return (
    <Stack gap="xs">
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          No checklist items yet.
        </Text>
      ) : (
        <>
          <Progress
            value={items.length ? (done / items.length) * 100 : 0}
            size="xs"
            color={done === items.length ? 'green' : 'blue'}
          />
          <Stack gap={4}>
            {items.map((item) => (
              <Group key={item.id} justify="space-between" wrap="nowrap" gap="xs">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <Checkbox
                    checked={item.done}
                    disabled={!canWrite}
                    onChange={(e) => onToggle(item.id, e.currentTarget.checked)}
                  />
                  <Text
                    size="sm"
                    truncate
                    td={item.done ? 'line-through' : undefined}
                    c={item.done ? 'dimmed' : undefined}
                  >
                    {item.title}
                  </Text>
                </Group>
                {canWrite && (
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onRemove(item.id)}>
                    <TbTrash size={12} />
                  </ActionIcon>
                )}
              </Group>
            ))}
          </Stack>
        </>
      )}
      {canWrite && (
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="sm"
            placeholder="Add item"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim() && !adding) {
                onAdd(title.trim())
                setTitle('')
              }
            }}
          />
          <Button
            size="sm"
            leftSection={<TbPlus size={14} />}
            disabled={!title.trim() || adding}
            loading={adding}
            onClick={() => {
              onAdd(title.trim())
              setTitle('')
            }}
          >
            Add
          </Button>
        </Group>
      )}
    </Stack>
  )
}
