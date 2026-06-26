import { Button, Group, Select, Stack, TagsInput, Textarea, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { type PhaseStatus, type ProjectPhase, STATUS_OPTIONS, type TagOption } from './phase.types'

export function EditPhaseModal({
  phase,
  availableTags,
  onSubmit,
}: {
  phase: ProjectPhase
  availableTags: TagOption[]
  onSubmit: (data: Record<string, unknown>) => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(phase.title)
  const [description, setDescription] = useState(phase.description ?? '')
  const [status, setStatus] = useState<PhaseStatus>(phase.status)
  const [startsAt, setStartsAt] = useState<Date | null>(phase.startsAt ? new Date(phase.startsAt) : null)
  const [endsAt, setEndsAt] = useState<Date | null>(phase.endsAt ? new Date(phase.endsAt) : null)
  const [tagNames, setTagNames] = useState<string[]>(phase.tags.map((t) => t.tag.name))

  const resolveTagIds = async (names: string[]): Promise<string[]> => {
    const ids: string[] = []
    for (const name of names) {
      const existing = availableTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        ids.push(existing.id)
      } else {
        try {
          const res = await fetch(`/api/projects/${phase.projectId}/tags`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color: 'blue' }),
          })
          if (res.ok) {
            const { tag } = (await res.json()) as { tag: TagOption }
            ids.push(tag.id)
            qc.invalidateQueries({ queryKey: ['tags', phase.projectId] })
          }
        } catch {
          // skip if tag creation fails
        }
      }
    }
    return ids
  }

  const submit = async () => {
    if (!title.trim()) return
    const tagIds = await resolveTagIds(tagNames)
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      status,
      startsAt: startsAt ? startsAt.toISOString() : null,
      endsAt: endsAt ? endsAt.toISOString() : null,
      tagIds,
    })
    modals.closeAll()
  }

  return (
    <Stack gap="sm">
      <TextInput
        label="Nama fase"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        required
        data-autofocus
      />
      <Textarea
        label="Deskripsi (opsional)"
        placeholder="Tujuan atau scope fase ini"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        autosize
        minRows={2}
      />
      <Select
        label="Status"
        data={STATUS_OPTIONS}
        value={status}
        onChange={(v) => setStatus((v as PhaseStatus) ?? 'PLANNING')}
      />
      <Group grow>
        <DateInput
          highlightToday
          label="Mulai"
          placeholder="Opsional"
          value={startsAt}
          onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
          clearable
        />
        <DateInput
          highlightToday
          label="Selesai"
          placeholder="Opsional"
          value={endsAt}
          onChange={(v) => setEndsAt(v ? new Date(v as unknown as string) : null)}
          clearable
        />
      </Group>
      <TagsInput
        label="Tags"
        placeholder="Pilih atau ketik untuk buat tag baru (Enter)"
        data={availableTags.map((t) => t.name)}
        value={tagNames}
        onChange={setTagNames}
        clearable
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Batal
        </Button>
        <Button size="xs" onClick={submit} disabled={!title.trim()}>
          Simpan
        </Button>
      </Group>
    </Stack>
  )
}
