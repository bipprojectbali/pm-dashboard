import { Button, Card, Group, Select, Skeleton, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbArrowLeft } from 'react-icons/tb'
import { TagSelector } from './eventformview/TagSelector'
import { api, EMPTY } from './eventformview/types'
import type { EventProject, EventTag, FormValues, TeamEvent } from './eventformview/types'

export function EventFormView({
  editId,
  onBack,
  onSaved,
}: {
  editId?: string
  onBack: () => void
  onSaved: (id: string) => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormValues>(EMPTY)
  const [initialized, setInitialized] = useState(!editId)
  const [error, setError] = useState<string | null>(null)
  const [extraTags, setExtraTags] = useState<EventTag[]>([])

  const eventQ = useQuery<{ event: TeamEvent }>({
    queryKey: ['events', 'detail', editId],
    queryFn: () => api(`/api/events/${editId}`),
    enabled: !!editId,
  })
  const tagsQ = useQuery<{ tags: EventTag[] }>({
    queryKey: ['event-tags'],
    queryFn: () => api('/api/event-tags'),
    staleTime: 5 * 60_000,
  })
  const projectsQ = useQuery<{ projects: EventProject[] }>({
    queryKey: ['projects'],
    queryFn: () => api('/api/projects'),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (!initialized && eventQ.data?.event) {
      const e = eventQ.data.event
      setForm({
        title: e.title,
        description: e.description ?? '',
        startsAt: new Date(e.startsAt),
        endsAt: e.endsAt ? new Date(e.endsAt) : null,
        location: e.location ?? '',
        projectId: e.projectId,
        tagIds: e.tags.map((t) => t.tagId),
      })
      setInitialized(true)
    }
  }, [initialized, eventQ.data])

  const allTags = [
    ...(tagsQ.data?.tags ?? []),
    ...extraTags.filter((t) => !tagsQ.data?.tags.find((x) => x.id === t.id)),
  ]
  const projects = projectsQ.data?.projects ?? []

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!values.title.trim()) throw new Error('Judul wajib diisi')
      if (!values.startsAt) throw new Error('Waktu mulai wajib diisi')
      const body = {
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        startsAt: values.startsAt.toISOString(),
        endsAt: values.endsAt ? values.endsAt.toISOString() : undefined,
        location: values.location.trim() || undefined,
        projectId: values.projectId || undefined,
        tagIds: values.tagIds,
      }
      if (editId) {
        return api<{ event: TeamEvent }>(`/api/events/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      return api<{ event: TeamEvent }>('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['events'] })
      onSaved((res as { event: TeamEvent }).event.id)
    },
    onError: (e) => setError(e.message),
  })

  const backButton = (
    <Button variant="subtle" color="gray" leftSection={<TbArrowLeft size={14} />} onClick={onBack} w="fit-content" size="sm">
      Kembali
    </Button>
  )

  if (editId && !initialized) {
    return (
      <Stack gap="md">
        {backButton}
        <Card withBorder radius="md" p="lg">
          <Stack gap="sm">
            <Skeleton height={28} width="60%" />
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </Stack>
        </Card>
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      {backButton}
      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Text fw={700} size="lg">{editId ? 'Edit Event' : 'Buat Event Baru'}</Text>

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

          {error && <Text size="sm" c="red">{error}</Text>}

          <Group justify="flex-end" mt={4}>
            <Button variant="subtle" color="gray" onClick={onBack}>Batal</Button>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
              {editId ? 'Simpan' : 'Buat Event'}
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  )
}
