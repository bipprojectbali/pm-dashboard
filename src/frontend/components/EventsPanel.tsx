import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  TbCalendarEvent,
  TbCalendarMonth,
  TbClock,
  TbEdit,
  TbLayoutGrid,
  TbLayoutList,
  TbMapPin,
  TbPlus,
  TbTag,
  TbTrash,
} from 'react-icons/tb'
import { EventsCalendarView } from '@/frontend/components/EventsCalendarView'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { useSession } from '@/frontend/hooks/useAuth'

type EventUser = { id: string; name: string; email: string; image?: string | null }
type EventProject = { id: string; name: string }
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
  project: EventProject | null
  tags: EventTagItem[]
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
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

function formatDateRange(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt)
  const dateStr = start.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  if (!endsAt) return `${dateStr}, ${timeStr}`
  const endTime = new Date(endsAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${dateStr}, ${timeStr} – ${endTime}`
}

function groupByDay(events: TeamEvent[]) {
  const map = new Map<string, TeamEvent[]>()
  for (const e of events) {
    const key = e.startsAt.slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return Array.from(map.entries()).map(([key, items]) => {
    const d = new Date(`${key}T00:00:00`)
    return {
      groupKey: key,
      groupLabel: d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      items,
      tagColor: undefined as string | undefined,
    }
  })
}

// BUG FIX #3: Gunakan firstTag saja — event multi-tag tidak lagi duplikat.
// Setiap event muncul tepat satu kali, di bawah tag pertamanya.
function groupByTag(events: TeamEvent[]) {
  const tagMap = new Map<string, { name: string; color: string; items: TeamEvent[] }>()
  const noTag: TeamEvent[] = []
  for (const e of events) {
    if (e.tags.length === 0) {
      noTag.push(e)
    } else {
      // Hanya masuk ke group tag pertama
      const first = e.tags[0].tag
      if (!tagMap.has(first.id)) tagMap.set(first.id, { name: first.name, color: first.color, items: [] })
      tagMap.get(first.id)!.items.push(e)
    }
  }
  const groups = Array.from(tagMap.entries())
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, { name, color, items }]) => ({ groupKey: id, groupLabel: name, tagColor: color, items }))
  if (noTag.length) groups.push({ groupKey: '__no_tag__', groupLabel: 'Tanpa Tag', tagColor: 'gray', items: noTag })
  return groups
}

function EventCard({
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

export function EventsPanel({
  onOpen,
  onEdit,
  onCreate,
}: {
  onOpen?: (id: string) => void
  // BUG FIX #1: onEdit terpisah dari onOpen — navigasi ke form edit, bukan detail view
  onEdit?: (id: string) => void
  onCreate?: () => void
}) {
  const { data: sessionData } = useSession()
  const user = sessionData?.user
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const qc = useQueryClient()

  // BUG FIX #2: Default showAll=true agar event baru langsung terlihat tanpa filter upcoming
  const [showAll, setShowAll] = useLocalStorage<boolean>({ key: 'pm:events:showAll', defaultValue: true })
  const [filterTagId, setFilterTagId] = useLocalStorage<string | null>({
    key: 'pm:events:filterTagId',
    defaultValue: null,
  })
  const [groupByTagMode, setGroupByTagMode] = useLocalStorage<boolean>({
    key: 'pm:events:groupByTag',
    defaultValue: true,
  })
  const [viewMode, setViewMode] = useLocalStorage<'list' | 'grid' | 'calendar'>({
    key: 'pm:events:view',
    defaultValue: 'list',
  })

  const eventsQ = useQuery<{ count: number; events: TeamEvent[] }>({
    queryKey: ['events', showAll ? 'all' : 'upcoming', filterTagId],
    queryFn: () => {
      const base = showAll ? '/api/events?limit=100' : '/api/events?upcoming=true&limit=100'
      return api(filterTagId ? `${base}&tagId=${filterTagId}` : base)
    },
    refetchInterval: 30_000,
  })

  // BUG FIX #5: Hapus staleTime agar tag baru langsung muncul setelah dibuat
  const tagsQ = useQuery<{ tags: Array<{ id: string; name: string; color: string }> }>({
    queryKey: ['event-tags'],
    queryFn: () => api('/api/event-tags'),
    refetchOnMount: true,
  })

  const deleteEvent = useMutation({
    mutationFn: (id: string) => api(`/api/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })

  const confirmDelete = (e: TeamEvent) =>
    modals.openConfirmModal({
      title: 'Hapus event ini?',
      children: <Text size="sm">"{e.title}" akan dihapus permanen.</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteEvent.mutate(e.id),
    })

  const allEventTags = tagsQ.data?.tags ?? []

  // BUG FIX: Auto-clear filterTagId jika tag sudah tidak ada (dihapus atau belum load)
  useEffect(() => {
    if (filterTagId && tagsQ.data && !tagsQ.data.tags.find((t) => t.id === filterTagId)) {
      setFilterTagId(null)
    }
  }, [filterTagId, tagsQ.data, setFilterTagId])

  const events = eventsQ.data?.events ?? []
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const groups = groupByTagMode ? groupByTag(events) : groupByDay(events)

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between" align="center">
        <Stack gap={0}>
          <Text fw={700} size="lg">
            Events Tim
          </Text>
          <Text size="sm" c="dimmed">
            Jadwal dan pengingat bersama — semua anggota tim bisa melihat dan menambah.
          </Text>
        </Stack>
        <Group gap="xs">
          {/* BUG FIX #4: Label menunjukkan AKSI berikutnya, bukan state saat ini */}
          <Button
            size="xs"
            variant={showAll ? 'light' : 'filled'}
            color={showAll ? 'gray' : 'blue'}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Upcoming saja' : 'Semua event'}
          </Button>
          <Button size="xs" leftSection={<TbPlus size={14} />} onClick={() => onCreate?.()}>
            Buat Event
          </Button>
        </Group>
      </Group>

      {/* Filter + grouping + view toolbar */}
      <Group gap="xs" align="center" justify="space-between">
        <Group gap="xs">
          <Select
            size="xs"
            placeholder="Filter tag..."
            leftSection={<TbTag size={12} />}
            clearable
            data={allEventTags.map((t) => ({ value: t.id, label: t.name }))}
            value={filterTagId}
            onChange={setFilterTagId}
            style={{ width: 180 }}
          />
          {/* Group toggle hanya relevan di mode list/grid */}
          {viewMode !== 'calendar' && (
            <Tooltip label={groupByTagMode ? 'Grouping: per tag (aktif)' : 'Grouping: per hari (aktif)'} withArrow>
              <Button
                size="xs"
                variant={groupByTagMode ? 'filled' : 'light'}
                color={groupByTagMode ? 'blue' : 'gray'}
                leftSection={groupByTagMode ? <TbTag size={12} /> : <TbLayoutList size={12} />}
                onClick={() => setGroupByTagMode((v) => !v)}
              >
                {groupByTagMode ? 'Group: Tag' : 'Group: Hari'}
              </Button>
            </Tooltip>
          )}
        </Group>
        <Group gap={4}>
          <Tooltip label="Tampilan list" withArrow>
            <ActionIcon
              size="sm"
              variant={viewMode === 'list' ? 'filled' : 'subtle'}
              color={viewMode === 'list' ? 'blue' : 'gray'}
              onClick={() => setViewMode('list')}
            >
              <TbLayoutList size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Tampilan grid" withArrow>
            <ActionIcon
              size="sm"
              variant={viewMode === 'grid' ? 'filled' : 'subtle'}
              color={viewMode === 'grid' ? 'blue' : 'gray'}
              onClick={() => setViewMode('grid')}
            >
              <TbLayoutGrid size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Tampilan kalender" withArrow>
            <ActionIcon
              size="sm"
              variant={viewMode === 'calendar' ? 'filled' : 'subtle'}
              color={viewMode === 'calendar' ? 'blue' : 'gray'}
              onClick={() => setViewMode('calendar')}
            >
              <TbCalendarMonth size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {eventsQ.isLoading && (
        <Text size="sm" c="dimmed">
          Memuat...
        </Text>
      )}

      {/* Kalender view — pisah dari list/grid */}
      {!eventsQ.isLoading && viewMode === 'calendar' && (
        <EventsCalendarView
          events={events}
          onOpen={(id) => onOpen?.(id)}
          onEdit={(id) => onEdit?.(id)}
          onDelete={confirmDelete}
          canEdit={(e) => isAdmin || user?.id === e.createdById}
          deleteLoadingId={deleteEvent.isPending ? (deleteEvent.variables ?? null) : null}
        />
      )}

      {!eventsQ.isLoading && viewMode !== 'calendar' && groups.length === 0 && (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap="xs">
            <ThemeIcon size="xl" radius="xl" variant="light" color="blue">
              <TbCalendarEvent size={24} />
            </ThemeIcon>
            <Text fw={600}>
              {filterTagId
                ? 'Tidak ada event dengan tag ini'
                : showAll
                  ? 'Belum ada event'
                  : 'Tidak ada event mendatang'}
            </Text>
            <Text size="sm" c="dimmed">
              {!filterTagId && !showAll
                ? 'Event yang sudah lewat disembunyikan. Klik "Semua event" untuk melihat semua.'
                : 'Buat event pertama untuk mengingatkan tim.'}
            </Text>
            {!filterTagId && !showAll && (
              <Button size="xs" variant="subtle" onClick={() => setShowAll(true)}>
                Tampilkan semua event
              </Button>
            )}
            <Button size="sm" leftSection={<TbPlus size={14} />} onClick={() => onCreate?.()} mt="xs">
              Buat Event
            </Button>
          </Stack>
        </Card>
      )}

      {viewMode !== 'calendar' &&
        groups.map(({ groupKey, groupLabel, items, tagColor }) => {
          const isToday = !groupByTagMode && groupKey === today
          const isTomorrow = !groupByTagMode && groupKey === tomorrow
          const isPast = !groupByTagMode && groupKey < today
          const labelColor = groupByTagMode
            ? (tagColor ?? 'blue')
            : isToday
              ? 'red'
              : isTomorrow
                ? 'orange'
                : isPast
                  ? 'dimmed'
                  : 'blue'

          return (
            <Stack key={groupKey} gap="xs">
              <Group gap={6} align="center">
                {groupByTagMode && tagColor && groupKey !== '__no_tag__' ? (
                  <Badge size="xs" color={tagColor} variant="filled">
                    {groupLabel}
                  </Badge>
                ) : (
                  <Text size="xs" fw={700} c={labelColor} tt="uppercase">
                    {isToday ? 'Hari ini' : isTomorrow ? 'Besok' : groupLabel}
                  </Text>
                )}
                {isToday && (
                  <Badge size="xs" color="red" variant="filled">
                    Today
                  </Badge>
                )}
                {isTomorrow && (
                  <Badge size="xs" color="orange" variant="light">
                    Besok
                  </Badge>
                )}
                <Text size="xs" c="dimmed">
                  ({items.length})
                </Text>
                <Divider style={{ flex: 1 }} />
              </Group>
              {viewMode === 'grid' ? (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                  {items.map((e) => (
                    <EventCard
                      key={`${groupKey}-${e.id}`}
                      event={e}
                      canEdit={isAdmin || user?.id === e.createdById}
                      onOpen={() => onOpen?.(e.id)}
                      onEdit={() => onEdit?.(e.id)} // BUG FIX #1
                      onDelete={() => confirmDelete(e)}
                      deleteLoading={deleteEvent.isPending && deleteEvent.variables === e.id}
                    />
                  ))}
                </SimpleGrid>
              ) : (
                <Stack gap="xs">
                  {items.map((e) => (
                    <EventCard
                      key={`${groupKey}-${e.id}`}
                      event={e}
                      canEdit={isAdmin || user?.id === e.createdById}
                      onOpen={() => onOpen?.(e.id)}
                      onEdit={() => onEdit?.(e.id)} // BUG FIX #1
                      onDelete={() => confirmDelete(e)}
                      deleteLoading={deleteEvent.isPending && deleteEvent.variables === e.id}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          )
        })}
    </Stack>
  )
}
