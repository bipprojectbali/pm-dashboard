import {
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCalendarEvent, TbCalendarPlus, TbHistory } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import type { ProjectUser } from './ProjectsPanel'

interface ProjectExtension {
  id: string
  previousEndAt: string | null
  newEndAt: string
  reason: string | null
  createdAt: string
  extendedBy: ProjectUser | null
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ExtensionsSection({
  projectId,
  currentEndAt,
  startsAt,
  canExtend,
}: {
  projectId: string
  currentEndAt: string | null
  startsAt: string | null
  canExtend: boolean
}) {
  const qc = useQueryClient()
  const [extendOpen, setExtendOpen] = useState(false)

  const historyQ = useQuery({
    queryKey: ['project-extensions', projectId],
    queryFn: () => api<{ extensions: ProjectExtension[] }>(`/api/projects/${projectId}/extensions`),
  })

  const extend = useMutation({
    mutationFn: (body: { newEndAt: string; reason: string | null }) =>
      api(`/api/projects/${projectId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-extensions', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setExtendOpen(false)
      notifySuccess({ message: 'Deadline diperpanjang.' })
    },
    onError: (err) => notifyError(err),
  })

  const extensions = historyQ.data?.extensions ?? []

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <TbHistory size={14} />
          <Text size="sm" c="dimmed">
            {extensions.length === 0 ? 'No extensions recorded' : `${extensions.length} extension(s)`}
          </Text>
        </Group>
        {canExtend && (
          <Button
            size="xs"
            variant="light"
            leftSection={<TbCalendarPlus size={14} />}
            onClick={() => setExtendOpen(true)}
          >
            Extend deadline
          </Button>
        )}
      </Group>

      {extensions.length > 0 && (
        <Stack gap={6}>
          {extensions.map((e) => (
            <Card key={e.id} withBorder padding="xs" radius="sm">
              <Stack gap={2}>
                <Group gap="xs" wrap="wrap">
                  <Text size="xs" fw={500}>
                    {formatDate(e.previousEndAt)} → {formatDate(e.newEndAt)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    by {e.extendedBy?.name ?? 'system'} · {new Date(e.createdAt).toLocaleString()}
                  </Text>
                </Group>
                {e.reason && (
                  <Text size="xs" c="dimmed">
                    {e.reason}
                  </Text>
                )}
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      <ExtendDeadlineModal
        opened={extendOpen}
        onClose={() => setExtendOpen(false)}
        currentEndAt={currentEndAt}
        startsAt={startsAt}
        onSubmit={(body) => extend.mutate(body)}
        loading={extend.isPending}
        error={extend.error?.message}
      />
    </Stack>
  )
}

function ExtendDeadlineModal({
  opened,
  onClose,
  currentEndAt,
  startsAt,
  onSubmit,
  loading,
  error,
}: {
  opened: boolean
  onClose: () => void
  currentEndAt: string | null
  startsAt: string | null
  onSubmit: (body: { newEndAt: string; reason: string | null }) => void
  loading: boolean
  error?: string
}) {
  const [newEnd, setNewEnd] = useState<Date | null>(currentEndAt ? new Date(currentEndAt) : null)
  const [reason, setReason] = useState('')
  const [initKey, setInitKey] = useState<string | null>(null)

  const key = currentEndAt ?? '__null__'
  if (opened && key !== initKey) {
    setInitKey(key)
    setNewEnd(currentEndAt ? new Date(currentEndAt) : null)
    setReason('')
  }
  if (!opened && initKey !== null) setInitKey(null)

  const startDate = startsAt ? new Date(startsAt) : null
  const sameAsCurrent = newEnd && currentEndAt && newEnd.getTime() === new Date(currentEndAt).getTime()
  const beforeStart = newEnd && startDate && newEnd < startDate
  const invalid = !newEnd || sameAsCurrent || beforeStart

  return (
    <Modal opened={opened} onClose={onClose} title="Extend deadline" size="md">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Current deadline: <b>{formatDate(currentEndAt)}</b>
        </Text>
        <DateInput highlightToday
          label="New deadline"
          value={newEnd}
          onChange={(v) => setNewEnd(v ? new Date(v as unknown as string) : null)}
          clearable
          leftSection={<TbCalendarEvent size={14} />}
          error={beforeStart ? 'Must be after project start' : sameAsCurrent ? 'Same as current deadline' : undefined}
        />
        <Textarea
          label="Reason (optional)"
          placeholder="e.g. Scope expanded to include payment gateway integration"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={5}
        />
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(invalid) || loading}
            loading={loading}
            onClick={() => newEnd && onSubmit({ newEndAt: newEnd.toISOString(), reason: reason.trim() || null })}
          >
            Save extension
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
