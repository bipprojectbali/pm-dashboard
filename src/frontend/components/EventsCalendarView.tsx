import { ActionIcon, Badge, Button, Card, Group, Indicator, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import { useMemo, useState } from 'react'
import { TbCalendarEvent, TbClock, TbEdit, TbMapPin, TbPlayerSkipForward, TbTag, TbTrash } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'

type EventUser = { id: string; name: string; email: string; image?: string | null }
type EventTagItem = { tagId: string; tag: { id: string; name: string; color: string } }

type TeamEvent = {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  location: string | null
  projectId: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  createdBy: EventUser | null
  project: { id: string; name: string } | null
  tags: EventTagItem[]
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function countdown(startsAt: string): { label: string; color: string } {
  const diffMs = new Date(startsAt).getTime() - Date.now()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffMs < 0) return { label: 'Selesai', color: 'gray' }
  if (diffDays === 0) return { label: 'Hari ini', color: 'red' }
  if (diffDays === 1) return { label: 'Besok', color: 'orange' }
  if (diffDays <= 7) return { label: `${diffDays} hari lagi`, color: 'yellow' }
  return { label: `${diffDays} hari lagi`, color: 'blue' }
}

// Warna dot hari: ambil yang paling urgent dari events di hari itu
const URGENCY = ['red', 'orange', 'yellow', 'blue', 'gray']
function dotColor(events: TeamEvent[]): string {
  const colors = events.map((e) => countdown(e.startsAt).color)
  return URGENCY.find((c) => colors.includes(c)) ?? 'blue'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function EventItem({
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

export function EventsCalendarView({
  events,
  onOpen,
  onEdit,
  onDelete,
  canEdit,
  deleteLoadingId,
}: {
  events: TeamEvent[]
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (e: TeamEvent) => void
  canEdit: (e: TeamEvent) => boolean
  deleteLoadingId: string | null
}) {
  const todayKey = toDateKey(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [month, setMonth] = useState<Date>(() => new Date())

  const selectedKey = toDateKey(selectedDate)
  const isToday = selectedKey === todayKey

  // Map YYYY-MM-DD → events[]
  const eventsByDate = useMemo(() => {
    const map = new Map<string, TeamEvent[]>()
    for (const e of events) {
      const key = e.startsAt.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [events])

  const selectedEvents = eventsByDate.get(selectedKey) ?? []

  const jumpToToday = () => {
    const today = new Date()
    setSelectedDate(today)
    setMonth(today)
  }

  // Find next day with events starting from today
  const jumpToNextEvent = () => {
    const sorted = events
      .map((e) => e.startsAt.slice(0, 10))
      .filter((k) => k > todayKey)
      .sort()
    if (sorted.length === 0) return
    const nextKey = sorted[0]
    const [y, m, d] = nextKey.split('-').map(Number)
    const next = new Date(y, m - 1, d)
    setSelectedDate(next)
    setMonth(next)
  }

  const selectedLabel = selectedDate.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Group align="flex-start" wrap="wrap" gap="md">
      {/* Calendar panel */}
      <Card withBorder radius="md" p="md" style={{ flexShrink: 0 }}>
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text size="sm" fw={600}>
              {month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </Text>
            <Group gap={6}>
              <Tooltip label="Hari ini" withArrow>
                <Button
                  size="compact-xs"
                  variant={isToday ? 'filled' : 'light'}
                  color="blue"
                  disabled={isToday}
                  onClick={jumpToToday}
                >
                  Hari ini
                </Button>
              </Tooltip>
              <Tooltip label="Event berikutnya" withArrow>
                <ActionIcon size="sm" variant="subtle" color="blue" onClick={jumpToNextEvent}>
                  <TbPlayerSkipForward size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <DatePicker
            value={selectedDate}
            onChange={(d) => {
              if (d) setSelectedDate(new Date(d as unknown as string))
            }}
            date={month}
            onDateChange={(d) => {
              if (d) setMonth(new Date(d as unknown as string))
            }}
            size="sm"
            renderDay={(dateInput) => {
              const d = new Date(dateInput as unknown as string)
              const key = toDateKey(d)
              const dayEvents = eventsByDate.get(key) ?? []
              const day = d.getDate()
              if (dayEvents.length === 0) return <div>{day}</div>
              return (
                <Indicator size={6} color={dotColor(dayEvents)} offset={-2}>
                  <div>{day}</div>
                </Indicator>
              )
            }}
          />

          {/* Legend */}
          <Group gap={6} wrap="wrap" mt={4}>
            {(['red', 'orange', 'blue', 'gray'] as const).map((c) => (
              <Group key={c} gap={4} wrap="nowrap">
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: `var(--mantine-color-${c}-5)`,
                    flexShrink: 0,
                  }}
                />
                <Text size="xs" c="dimmed">
                  {c === 'red' ? 'Hari ini' : c === 'orange' ? 'Besok' : c === 'blue' ? 'Akan datang' : 'Lewat'}
                </Text>
              </Group>
            ))}
          </Group>
        </Stack>
      </Card>

      {/* Day events panel */}
      <Stack gap="xs" style={{ flex: 1, minWidth: 240 }}>
        <Group gap={6} align="center">
          <Text fw={700} size="sm">
            {selectedLabel}
          </Text>
          {isToday && (
            <Badge size="xs" color="red" variant="filled">
              Today
            </Badge>
          )}
          <Badge size="xs" color="blue" variant="light">
            {selectedEvents.length} event
          </Badge>
        </Group>

        {selectedEvents.length === 0 ? (
          <Card withBorder radius="md" p="lg">
            <Stack align="center" gap={4}>
              <TbCalendarEvent size={28} style={{ color: 'var(--mantine-color-dimmed)' }} />
              <Text size="sm" c="dimmed">
                Tidak ada event pada hari ini
              </Text>
            </Stack>
          </Card>
        ) : (
          <Stack gap="xs">
            {selectedEvents
              .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
              .map((e) => (
                <EventItem
                  key={e.id}
                  event={e}
                  canEdit={canEdit(e)}
                  onOpen={() => onOpen(e.id)}
                  onEdit={() => onEdit(e.id)}
                  onDelete={() => onDelete(e)}
                  deleteLoading={deleteLoadingId === e.id}
                />
              ))}
          </Stack>
        )}

        {events.length > 0 && (
          <Text size="xs" c="dimmed" ta="center" pt={4}>
            {eventsByDate.size} hari dengan event · total {events.length} event
          </Text>
        )}
      </Stack>
    </Group>
  )
}
