import { Button, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TagSelector } from './eventformview/TagSelector'
import { EMPTY, api, type EventProject, type EventTag, type FormValues } from './eventformview/types'

export function EventFormModal({
  opened,
  onClose,
  initial,
  editId,
  projects,
}: {
  opened: boolean
  onClose: () => void
  initial?: Partial<FormValues>
  editId?: string
  projects: EventProject[]
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormValues>({ ...EMPTY, ...initial })
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setForm({ ...EMPTY, ...initial })
    setError(null)
  }

  const tagsQ = useQuery<{ tags: EventTag[] }>({
    queryKey: ['event-tags'],
    queryFn: () => api('/api/event-tags'),
    staleTime: 5 * 60_000,
  })
  const [extraTags, setExtraTags] = useState<EventTag[]>([])
  const allTags = [
    ...(tagsQ.data?.tags ?? []),
    ...extraTags.filter((t) => !tagsQ.data?.tags.find((x) => x.id === t.id)),
  ]

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!values.title.trim()) throw new Error('Judul wajib diisi')
      if (!values.startsAt) throw new Error('Waktu mulai wajib diisi')
      const body = {
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        startsAt: new Date(values.startsAt as unknown as string).toISOString(),
        endsAt: values.endsAt ? new Date(values.endsAt as unknown as string).toISOString() : undefined,
        location: values.location.trim() || undefined,
        projectId: values.projectId || undefined,
        tagIds: values.tagIds,
      }
      if (editId) {
        return api(`/api/events/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      return api('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      onClose()
      reset()
    },
    onError: (e) => setError(e.message),
  })

  return (
    <Modal
      opened={opened}
      onClose={() => {
        onClose()
        reset()
      }}
      title={editId ? 'Edit Event' : 'Buat Event Baru'}
      size="md"
    >
      <Stack gap="sm">
        <TextInput
          label="Judul"
          placeholder="cth. Meeting mingguan, Review sprint..."
          required
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <DateTimePicker
          label="Waktu mulai"
          placeholder="Pilih tanggal & jam"
          required
          value={form.startsAt}
          onChange={(v) => setForm((f) => ({ ...f, startsAt: v ? new Date(v as unknown as string) : null }))}
          clearable
          highlightToday
        />
        <DateTimePicker
          label="Waktu selesai (opsional)"
          placeholder="Pilih tanggal & jam"
          value={form.endsAt}
          onChange={(v) => setForm((f) => ({ ...f, endsAt: v ? new Date(v as unknown as string) : null }))}
          clearable
          minDate={form.startsAt ?? undefined}
          highlightToday
        />
        <TextInput
          label="Lokasi (opsional)"
          placeholder="cth. Ruang rapat A, Google Meet..."
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
        />
        <Select
          label="Proyek terkait (opsional)"
          placeholder={projects.length === 0 ? 'Tidak ada proyek tersedia' : 'Pilih proyek...'}
          clearable
          disabled={projects.length === 0}
          data={projects.map((p) => ({ value: p.id, label: p.name }))}
          value={form.projectId}
          onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
        />
        <TagSelector
          tagIds={form.tagIds}
          onChange={(ids) => setForm((f) => ({ ...f, tagIds: ids }))}
          allTags={allTags}
          onTagCreated={(tag) => {
            setExtraTags((prev) => [...prev, tag])
            qc.invalidateQueries({ queryKey: ['event-tags'] })
          }}
        />
        <Textarea
          label="Catatan (opsional)"
          placeholder="Detail tambahan..."
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end" mt={4}>
          <Button
            variant="subtle"
            color="gray"
            onClick={() => {
              onClose()
              reset()
            }}
          >
            Batal
          </Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
            {editId ? 'Simpan' : 'Buat Event'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
