import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbArrowLeft, TbCalendarEvent, TbClock, TbEdit, TbMapPin, TbTag, TbTrash, TbUser } from 'react-icons/tb'
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

function formatFull(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function EventDetailView({
  eventId,
  onBack,
  onEdit,
}: {
  eventId: string
  onBack: () => void
  onEdit?: () => void
}) {
  const { data: sessionData } = useSession()
  const user = sessionData?.user
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const qc = useQueryClient()

  const eventQ = useQuery<{ event: TeamEvent }>({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => api(`/api/events/${eventId}`),
  })

  const deleteEvent = useMutation({
    mutationFn: () => api(`/api/events/${eventId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      onBack()
    },
  })

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Hapus event ini?',
      children: <Text size="sm">"{event?.title}" akan dihapus permanen.</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteEvent.mutate(),
    })

  const event = eventQ.data?.event
  const canEdit = isAdmin || user?.id === event?.createdById

  if (eventQ.isLoading) {
    return (
      <Stack gap="md">
        <Button variant="subtle" color="gray" leftSection={<TbArrowLeft size={14} />} onClick={onBack} w="fit-content">
          Kembali ke Events
        </Button>
        <Card withBorder radius="md" p="lg">
          <Stack gap="sm">
            <Skeleton height={28} width="60%" />
            <Skeleton height={16} width="40%" />
            <Skeleton height={16} width="30%" />
            <Skeleton height={60} />
          </Stack>
        </Card>
      </Stack>
    )
  }

  if (!event) {
    return (
      <Stack gap="md">
        <Button variant="subtle" color="gray" leftSection={<TbArrowLeft size={14} />} onClick={onBack} w="fit-content">
          Kembali ke Events
        </Button>
        <Text c="dimmed">Event tidak ditemukan.</Text>
      </Stack>
    )
  }

  const cd = countdown(event.startsAt)

  return (
    <Stack gap="md">
      {/* Back */}
      <Button
        variant="subtle"
        color="gray"
        leftSection={<TbArrowLeft size={14} />}
        onClick={onBack}
        w="fit-content"
        size="sm"
      >
        Kembali ke Events
      </Button>

      {/* Main card */}
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          {/* Title + countdown */}
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon size="xl" radius="md" variant="light" color={cd.color} style={{ flexShrink: 0 }}>
              <TbCalendarEvent size={22} />
            </ThemeIcon>
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Group gap={8} wrap="wrap" align="center">
                <Text fw={700} size="xl" style={{ lineHeight: 1.2 }}>
                  {event.title}
                </Text>
                <Badge color={cd.color} variant="light">
                  {cd.label}
                </Badge>
              </Group>
              {event.tags.length > 0 && (
                <Group gap={4} wrap="wrap">
                  {event.tags.map((t) => (
                    <Badge
                      key={t.tagId}
                      size="sm"
                      color={t.tag.color}
                      variant="light"
                      leftSection={<TbTag size={10} />}
                    >
                      {t.tag.name}
                    </Badge>
                  ))}
                </Group>
              )}
            </Stack>
            {canEdit && (
              <Group gap={6} style={{ flexShrink: 0 }}>
                <Tooltip label="Edit event" withArrow>
                  <ActionIcon variant="light" color="blue" onClick={() => onEdit?.()}>
                    <TbEdit size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Hapus event" withArrow>
                  <ActionIcon variant="light" color="red" loading={deleteEvent.isPending} onClick={confirmDelete}>
                    <TbTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )}
          </Group>

          <Divider />

          {/* Info rows */}
          <Stack gap="xs">
            <Group gap={8} wrap="nowrap">
              <TbClock size={16} style={{ color: 'var(--mantine-color-blue-5)', flexShrink: 0 }} />
              <Stack gap={0}>
                <Text size="sm" fw={500}>
                  {formatFull(event.startsAt)}
                </Text>
                {event.endsAt && (
                  <Text size="xs" c="dimmed">
                    s.d. {formatFull(event.endsAt)}
                  </Text>
                )}
              </Stack>
            </Group>

            {event.location && (
              <Group gap={8} wrap="nowrap">
                <TbMapPin size={16} style={{ color: 'var(--mantine-color-orange-5)', flexShrink: 0 }} />
                <Text size="sm">{event.location}</Text>
              </Group>
            )}

            {event.project && (
              <Group gap={8} wrap="nowrap">
                <TbCalendarEvent size={16} style={{ color: 'var(--mantine-color-teal-5)', flexShrink: 0 }} />
                <Badge variant="outline" color="teal" size="sm">
                  {event.project.name}
                </Badge>
              </Group>
            )}
          </Stack>

          {/* Description */}
          {event.description && (
            <>
              <Divider />
              <Stack gap={4}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Catatan
                </Text>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {event.description}
                </Text>
              </Stack>
            </>
          )}

          <Divider />

          {/* Footer — creator + timestamps */}
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap={6} wrap="nowrap">
              <TbUser size={14} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
              {event.createdBy ? (
                <Group gap={6} wrap="nowrap">
                  <UserAvatar name={event.createdBy.name} image={event.createdBy.image} size={20} color="gray" />
                  <Text size="xs" c="dimmed">
                    {event.createdBy.name}
                  </Text>
                </Group>
              ) : (
                <Text size="xs" c="dimmed">
                  Sistem
                </Text>
              )}
            </Group>
            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">
                Dibuat{' '}
                {new Date(event.createdAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
              {event.updatedAt !== event.createdAt && (
                <Text size="xs" c="dimmed">
                  Diperbarui{' '}
                  {new Date(event.updatedAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              )}
            </Stack>
          </Group>
        </Stack>
      </Card>
    </Stack>
  )
}
