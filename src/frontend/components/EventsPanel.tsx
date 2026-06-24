import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { TbCalendarMonth, TbLayoutGrid, TbLayoutList, TbPlus, TbTag } from 'react-icons/tb'
import { EventsCalendarView } from '@/frontend/components/EventsCalendarView'
import { useSession } from '@/frontend/hooks/useAuth'
import { EventCard } from './eventspanel/EventCard'
import { EventsEmptyState } from './eventspanel/EventsEmptyState'
import { api, groupByDay, groupByTag } from './eventspanel/helpers'
import type { TeamEvent } from './eventspanel/types'

export function EventsPanel({
  onOpen,
  onEdit,
  onCreate,
}: {
  onOpen?: (id: string) => void
  onEdit?: (id: string) => void
  onCreate?: () => void
}) {
  const { data: sessionData } = useSession()
  const user = sessionData?.user
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const qc = useQueryClient()

  // Default showAll=true so newly created events are visible without toggling filter.
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

  // No staleTime — ensures freshly created tags appear immediately on next mount.
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
      children: <Text size="sm">&quot;{e.title}&quot; akan dihapus permanen.</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteEvent.mutate(e.id),
    })

  const allEventTags = tagsQ.data?.tags ?? []

  // Auto-clear filterTagId when the tag no longer exists (deleted externally).
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
      <Group justify="space-between" align="center">
        <Stack gap={0}>
          <Text fw={700} size="lg">
            Events Tim
          </Text>
          <Text size="sm" c="dimmed">
            Jadwal dan pengingat bersama &mdash; semua anggota tim bisa melihat dan menambah.
          </Text>
        </Stack>
        <Group gap="xs">
          {/* Label shows the NEXT action, not the current state — toggling feels intuitive. */}
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
        <EventsEmptyState
          filterTagId={filterTagId}
          showAll={showAll}
          onShowAll={() => setShowAll(true)}
          onCreate={() => onCreate?.()}
        />
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
                      onEdit={() => onEdit?.(e.id)}
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
                      onEdit={() => onEdit?.(e.id)}
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
