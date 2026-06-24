import { ActionIcon, Badge, Card, Checkbox, Group, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core'
import { TbPencil, TbTrash } from 'react-icons/tb'
import { formatDate } from './helpers'
import type { MilestoneCardProps, ProjectMilestone } from './types'

export function MilestoneRow({ m, canManage, now, onToggle, onEdit, onDelete, isUpdating }: MilestoneCardProps) {
  const done = !!m.completedAt
  const overdue = !done && !!m.dueAt && new Date(m.dueAt).getTime() < now
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
        <Checkbox
          checked={done}
          disabled={!canManage || isUpdating}
          onChange={(e) => onToggle(m.id, e.currentTarget.checked)}
        />
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} truncate td={done ? 'line-through' : undefined} c={done ? 'dimmed' : undefined}>
            {m.title}
          </Text>
          {m.description && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {m.description}
            </Text>
          )}
          <Group gap={4} wrap="wrap">
            {m.dueAt && (
              <Text size="xs" c={overdue ? 'red' : 'dimmed'}>
                Due {formatDate(m.dueAt)}
              </Text>
            )}
            {overdue && (
              <Badge size="xs" color="red" variant="light">
                Overdue
              </Badge>
            )}
            {done && (
              <Text size="xs" c="dimmed">
                &middot; Done {formatDate(m.completedAt)}
              </Text>
            )}
            {m.tags.map((t) => (
              <Badge key={t.tagId} size="xs" color={t.tag.color} variant="light">
                {t.tag.name}
              </Badge>
            ))}
          </Group>
        </Stack>
      </Group>
      {canManage && (
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Edit">
            <ActionIcon variant="subtle" size="sm" onClick={() => onEdit(m)}>
              <TbPencil size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Hapus">
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(m)}>
              <TbTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Group>
  )
}

export function MilestoneGridCard({ m, canManage, now, onToggle, onEdit, onDelete, isUpdating }: MilestoneCardProps) {
  const done = !!m.completedAt
  const overdue = !done && !!m.dueAt && new Date(m.dueAt).getTime() < now
  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Checkbox
              checked={done}
              disabled={!canManage || isUpdating}
              onChange={(e) => onToggle(m.id, e.currentTarget.checked)}
            />
            <Text
              size="sm"
              fw={600}
              truncate
              td={done ? 'line-through' : undefined}
              c={done ? 'dimmed' : undefined}
              style={{ flex: 1 }}
            >
              {m.title}
            </Text>
          </Group>
          {canManage && (
            <Group gap={2} wrap="nowrap">
              <ActionIcon variant="subtle" size="sm" onClick={() => onEdit(m)}>
                <TbPencil size={13} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(m)}>
                <TbTrash size={13} />
              </ActionIcon>
            </Group>
          )}
        </Group>
        {m.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {m.description}
          </Text>
        )}
        <Group gap={4} wrap="wrap">
          {m.dueAt && (
            <Text size="xs" c={overdue ? 'red' : 'dimmed'}>
              {overdue ? '⚠ ' : ''}Due {formatDate(m.dueAt)}
            </Text>
          )}
          {done && (
            <Text size="xs" c="green">
              ✓ Done {formatDate(m.completedAt)}
            </Text>
          )}
        </Group>
        {m.tags.length > 0 && (
          <Group gap={4} wrap="wrap">
            {m.tags.map((t) => (
              <Badge key={t.tagId} size="xs" color={t.tag.color} variant="light">
                {t.tag.name}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </Card>
  )
}

interface MilestoneListProps {
  items: ProjectMilestone[]
  viewMode: 'list' | 'grid'
  cardProps: Omit<MilestoneCardProps, 'm'>
}

export function MilestoneList({ items, viewMode, cardProps }: MilestoneListProps) {
  if (!items.length) return <Text size="xs" c="dimmed">Tidak ada milestone.</Text>
  if (viewMode === 'grid') {
    return (
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        {items.map((m) => <MilestoneGridCard key={m.id} m={m} {...cardProps} />)}
      </SimpleGrid>
    )
  }
  return (
    <Stack gap={6}>
      {items.map((m) => <MilestoneRow key={m.id} m={m} {...cardProps} />)}
    </Stack>
  )
}
