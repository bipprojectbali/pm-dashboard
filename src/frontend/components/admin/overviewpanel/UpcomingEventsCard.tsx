import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core'
import type { useNavigate } from '@tanstack/react-router'
import { TbCalendarEvent } from 'react-icons/tb'
import type { UpcomingEvent } from './types'

export function UpcomingEventsCard({
  events,
  isLoading,
  navigate,
  todayCount,
  weekCount,
}: {
  events: UpcomingEvent[]
  isLoading: boolean
  navigate: ReturnType<typeof useNavigate>
  // Accurate counts from the server aggregate (GET /api/events/badge-stats) —
  // NOT derived from `events`, which is capped at 100 rows and would
  // silently under-report the badge numbers past that. Falls back to
  // client-side filtering of `events` only while the aggregate is loading.
  todayCount?: number
  weekCount?: number
}) {
  if (!events.length && isLoading) return null

  const todayKey = new Date().toISOString().slice(0, 10)
  const weekKey = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const todayEvents = events.filter((e) => e.startsAt.slice(0, 10) === todayKey)
  const weekEvents = events.filter((e) => {
    const k = e.startsAt.slice(0, 10)
    return k > todayKey && k <= weekKey
  })
  const shown = [...todayEvents, ...weekEvents].slice(0, 6)
  const todayBadge = todayCount ?? todayEvents.length
  const weekBadge = weekCount ?? weekEvents.length
  if (shown.length === 0 && todayBadge === 0 && weekBadge === 0) return null

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <TbCalendarEvent size={16} />
          <Title order={5}>Events Mendatang</Title>
          {todayBadge > 0 && (
            <Badge size="xs" color="red" variant="filled">
              {todayBadge} hari ini
            </Badge>
          )}
          {weekBadge > 0 && (
            <Badge size="xs" color="blue" variant="light">
              {weekBadge} minggu ini
            </Badge>
          )}
        </Group>
        <Text
          size="xs"
          c="blue"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate({ to: '/pm', search: { tab: 'events' } })}
        >
          Lihat semua →
        </Text>
      </Group>
      <Stack gap={4}>
        {shown.map((e) => {
          const isToday = e.startsAt.slice(0, 10) === todayKey
          return (
            <Group
              key={e.id}
              gap="sm"
              wrap="nowrap"
              style={{ cursor: 'pointer', borderRadius: 6, padding: '4px 8px' }}
              onClick={() => navigate({ to: '/pm', search: { tab: 'events', eventId: e.id } })}
            >
              <TbCalendarEvent
                size={13}
                color={`var(--mantine-color-${isToday ? 'red' : 'blue'}-5)`}
                style={{ flexShrink: 0 }}
              />
              <Text size="sm" truncate style={{ flex: 1 }}>
                {e.title}
              </Text>
              {e.tags.slice(0, 2).map((t) => (
                <Badge key={t.tagId} size="xs" color={t.tag.color} variant="light">
                  {t.tag.name}
                </Badge>
              ))}
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {isToday
                  ? new Date(e.startsAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                  : new Date(e.startsAt).toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
              </Text>
            </Group>
          )
        })}
      </Stack>
    </Card>
  )
}
