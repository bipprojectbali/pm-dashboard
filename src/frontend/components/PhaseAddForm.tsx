import { Button, Card, Group, MultiSelect, Stack, Text, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbPlus, TbTag } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import type { TagOption } from './PhaseModals'

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
  onSuccess,
}: {
  projectId: string
  availableTags: TagOption[]
  onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [endsAt, setEndsAt] = useState<Date | null>(null)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [localTags, setLocalTags] = useState<TagOption[]>([])
  const [newTagName, setNewTagName] = useState('')

  const allTags = useMemo(
    () => [...availableTags, ...localTags.filter((lt) => !availableTags.some((at) => at.id === lt.id))],
    [availableTags, localTags],
  )

  const create = useMutation({
    mutationFn: (body: PhaseCreateInput) => createPhase(projectId, body),
    onSuccess: () => {
      setTitle('')
      setStartsAt(null)
      setEndsAt(null)
      setTagIds([])
      setLocalTags([])
      setNewTagName('')
      notifySuccess({ message: 'Fase dibuat.' })
      onSuccess()
    },
    onError: (err) => notifyError(err),
  })

  const createTag = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/projects/${projectId}/tags`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: 'blue' }),
      })
      if (!res.ok) throw new Error('Gagal membuat tag')
      return res.json() as Promise<{ tag: TagOption }>
    },
    onSuccess: ({ tag }) => {
      setLocalTags((prev) => [...prev, tag])
      setTagIds((prev) => [...prev, tag.id])
      setNewTagName('')
      qc.invalidateQueries({ queryKey: ['tags', projectId] })
    },
    onError: (err) => notifyError(err),
  })

  const submit = () => {
    if (!title.trim() || create.isPending) return
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
            w={170}
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
            w={170}
          />
          <Button
            leftSection={<TbPlus size={13} />}
            size="xs"
            disabled={!title.trim() || create.isPending}
            loading={create.isPending}
            onClick={submit}
          >
            Tambah
          </Button>
        </Group>
        <MultiSelect
          placeholder="Tag (opsional)"
          data={allTags.map((t) => ({ value: t.id, label: t.name }))}
          value={tagIds}
          onChange={setTagIds}
          size="xs"
          searchable
          clearable
        />
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="xs"
            placeholder="Buat tag baru…"
            leftSection={<TbTag size={12} />}
            value={newTagName}
            onChange={(e) => setNewTagName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTagName.trim()) createTag.mutate(newTagName.trim())
            }}
            style={{ flex: 1 }}
          />
          <Button
            size="xs"
            variant="light"
            leftSection={<TbPlus size={12} />}
            disabled={!newTagName.trim() || createTag.isPending}
            loading={createTag.isPending}
            onClick={() => newTagName.trim() && createTag.mutate(newTagName.trim())}
          >
            Buat
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
