import { ActionIcon, Badge, Card, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { TbCalendarEvent, TbClock, TbEdit, TbMapPin, TbTag, TbTrash } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import type { TeamEvent } from './types'
import { countdown, formatTime } from './utils'

export function EventItem({
  event,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
  deleteLoading,
}: {
  event: TeamEvent
  canEdit: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  deleteLoading: boolean
}) {
  const cd = countdown(event.startsAt)
  return (
    <Card withBorder radius="sm" padding="sm" style={{ cursor: 'pointer' }} onClick={onOpen}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size="sm" radius="md" variant="light" color={cd.color} style={{ flexShrink: 0, marginTop: 2 }}>
            <TbCalendarEvent size={12} />
          </ThemeIcon>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={4} wrap="wrap" align="center">
              <Text fw={600} size="sm" lineClamp={1}>
                {event.title}
              </Text>
              <Badge size="xs" color={cd.color} variant="light">
                {cd.label}
              </Badge>
            </Group>
            <Group gap="xs" wrap="wrap">
              <Group gap={4} wrap="nowrap">
                <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                <Text size="xs" c="dimmed">
                  {formatTime(event.startsAt)}
                  {event.endsAt ? ` – ${formatTime(event.endsAt)}` : ''}
                </Text>
              </Group>
              {event.location && (
                <Group gap={4} wrap="nowrap">
                  <TbMapPin size={11} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {event.location}
                  </Text>
                </Group>
              )}
            </Group>
            {event.tags.length > 0 && (
              <Group gap={4} wrap="wrap">
                <TbTag size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                {event.tags.map((t) => (
                  <Badge key={t.tagId} size="xs" color={t.tag.color} variant="light">
                    {t.tag.name}
                  </Badge>
                ))}
              </Group>
            )}
            {event.createdBy && (
              <Group gap={4} wrap="nowrap">
                <UserAvatar name={event.createdBy.name} image={event.createdBy.image} size={12} color="gray" />
                <Text size="xs" c="dimmed">
                  {event.createdBy.name}
                </Text>
              </Group>
            )}
          </Stack>
        </Group>
        {canEdit && (
          <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Tooltip label="Edit" withArrow>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
              >
                <TbEdit size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Hapus" withArrow>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                loading={deleteLoading}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <TbTrash size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
    </Card>
  )
}
