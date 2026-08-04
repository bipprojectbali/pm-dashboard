import { ActionIcon, Badge, Card, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { TbCalendarEvent, TbClock, TbEdit, TbMapPin, TbTrash } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { countdown } from '@/frontend/lib/dates'
import { formatDateRange } from './helpers'
import type { TeamEvent } from './types'

type Props = {
  event: TeamEvent
  canEdit: boolean
  onOpen: () => void
  // onEdit navigates to edit form, not detail view — kept separate from onOpen intentionally.
  onEdit: () => void
  onDelete: () => void
  deleteLoading: boolean
}

export function EventCard({ event, canEdit, onOpen, onEdit, onDelete, deleteLoading }: Props) {
  const cd = countdown(event.startsAt)
  return (
    <Card withBorder radius="md" padding="sm" style={{ cursor: 'pointer' }} onClick={onOpen}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size="md" radius="md" variant="light" color={cd.color} style={{ flexShrink: 0, marginTop: 2 }}>
            <TbCalendarEvent size={16} />
          </ThemeIcon>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="wrap" align="center">
              <Text fw={600} size="sm">
                {event.title}
              </Text>
              <Badge size="xs" color={cd.color} variant="light">
                {cd.label}
              </Badge>
              {event.project && (
                <Badge size="xs" variant="outline" color="gray">
                  {event.project.name}
                </Badge>
              )}
              {event.tags.map((t) => (
                <Badge key={t.tagId} size="xs" color={t.tag.color} variant="light">
                  {t.tag.name}
                </Badge>
              ))}
            </Group>
            <Group gap="xs" wrap="wrap">
              <Group gap={4} wrap="nowrap">
                <TbClock size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                <Text size="xs" c="dimmed">
                  {formatDateRange(event.startsAt, event.endsAt)}
                </Text>
              </Group>
              {event.location && (
                <Group gap={4} wrap="nowrap">
                  <TbMapPin size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                  <Text size="xs" c="dimmed">
                    {event.location}
                  </Text>
                </Group>
              )}
            </Group>
            {event.description && (
              <Text size="xs" c="dimmed" lineClamp={2}>
                {event.description}
              </Text>
            )}
            {event.createdBy && (
              <Group gap={4} wrap="nowrap" mt={2}>
                <UserAvatar name={event.createdBy.name} image={event.createdBy.image} size={14} color="gray" />
                <Text size="xs" c="dimmed">
                  {event.createdBy.name}
                </Text>
              </Group>
            )}
          </Stack>
        </Group>
        {canEdit && (
          <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Tooltip label="Edit event" withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
              >
                <TbEdit size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Hapus event" withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                loading={deleteLoading}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <TbTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
    </Card>
  )
}
