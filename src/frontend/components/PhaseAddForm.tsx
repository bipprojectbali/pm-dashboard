import { Button, Card, Group, Stack, TagsInput, Text, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbPlus } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import type { TagOption } from './phase.types'

type PhaseCreateInput = {
  title: string
  status: string
  startsAt: string | null
  endsAt: string | null
  tagIds: string[]
}

async function createPhase(projectId: string, body: PhaseCreateInput) {
  const res = await fetch(`/api/projects/${projectId}/phases`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function PhaseAddForm({
  projectId,
  availableTags,
  existingNames,
  onSuccess,
}: {
  projectId: string
  availableTags: TagOption[]
  existingNames: string[]
  onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [endsAt, setEndsAt] = useState<Date | null>(null)
  const [tagNames, setTagNames] = useState<string[]>([])

  const isDuplicate = useMemo(() => {
    const t = title.trim().toLowerCase()
    return t.length > 0 && existingNames.some((n) => n.trim().toLowerCase() === t)
  }, [title, existingNames])

  const create = useMutation({
    mutationFn: (body: PhaseCreateInput) => createPhase(projectId, body),
    onSuccess: () => {
      setTitle('')
      setStartsAt(null)
      setEndsAt(null)
      setTagNames([])
      notifySuccess({ message: 'Fase dibuat.' })
      onSuccess()
    },
    onError: (err) => notifyError(err),
  })

  const resolveTagIds = async (names: string[]): Promise<string[]> => {
    const ids: string[] = []
    for (const name of names) {
      const existing = availableTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        ids.push(existing.id)
      } else {
        try {
          const res = await fetch(`/api/projects/${projectId}/tags`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color: 'blue' }),
          })
          if (res.ok) {
            const { tag } = (await res.json()) as { tag: TagOption }
            ids.push(tag.id)
            qc.invalidateQueries({ queryKey: ['tags', projectId] })
          }
        } catch {
          // skip if tag creation fails
        }
      }
    }
    return ids
  }

  const submit = async () => {
    if (!title.trim() || isDuplicate || create.isPending) return
    const tagIds = await resolveTagIds(tagNames)
    create.mutate({
      title: title.trim(),
      status: 'PLANNING',
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      tagIds,
    })
  }

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed">
          Tambah Fase
        </Text>
        <TextInput
          placeholder="Nama fase"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          size="xs"
          error={isDuplicate ? 'Nama fase sudah dipakai di project ini' : null}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <Group gap="xs" wrap="nowrap">
          <DateInput
            highlightToday
            placeholder="Mulai (opsional)"
            value={startsAt}
            onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
            clearable
            size="xs"
            w={150}
          />
          <Text size="xs" c="dimmed">
            –
          </Text>
          <DateInput
            highlightToday
            placeholder="Selesai (opsional)"
            value={endsAt}
            onChange={(v) => setEndsAt(v ? new Date(v as unknown as string) : null)}
            clearable
            size="xs"
            w={150}
          />
          <TagsInput
            placeholder="Tag (Enter untuk buat)"
            data={availableTags.map((t) => t.name)}
            value={tagNames}
            onChange={setTagNames}
            size="xs"
            clearable
            style={{ flex: 1 }}
          />
          <Button
            leftSection={<TbPlus size={13} />}
            size="xs"
            disabled={!title.trim() || isDuplicate || create.isPending}
            loading={create.isPending}
            onClick={submit}
          >
            Tambah
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
