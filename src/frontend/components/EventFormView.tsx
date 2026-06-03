import {
  Badge,
  Button,
  Card,
  ColorSwatch,
  Group,
  MultiSelect,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbArrowLeft, TbTag } from 'react-icons/tb'

type EventProject = { id: string; name: string }
type EventTag = { id: string; name: string; color: string }
type EventTagItem = { tagId: string; tag: EventTag }

interface TeamEvent {
  id: string; title: string; description: string | null; startsAt: string; endsAt: string | null
  location: string | null; projectId: string | null; createdById: string | null
  createdAt: string; updatedAt: string; createdBy: { id: string; name: string } | null
  project: EventProject | null; tags: EventTagItem[]
}

type FormValues = {
  title: string; description: string; startsAt: Date | null; endsAt: Date | null
  location: string; projectId: string | null; tagIds: string[]
}

const EMPTY: FormValues = { title: '', description: '', startsAt: null, endsAt: null, location: '', projectId: null, tagIds: [] }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Tag Selector ────────────────────────────────────────────────────────────

const TAG_COLORS = ['blue', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'cyan', 'gray']
const CREATE_PREFIX = '__create__:'

function TagSelector({
  tagIds, onChange, allTags, onTagCreated,
}: {
  tagIds: string[]; onChange: (ids: string[]) => void
  allTags: EventTag[]; onTagCreated: (tag: EventTag) => void
}) {
  const [search, setSearch] = useState('')
  const [newColor, setNewColor] = useState('blue')
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const createTag = useMutation({
    mutationFn: (name: string) =>
      api<{ tag: EventTag }>('/api/event-tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      }),
    onSuccess: ({ tag }) => {
      onTagCreated(tag); onChange([...tagIds, tag.id])
      setPendingName(null); setNewColor('blue'); setCreateError(null)
    },
    onError: (e) => setCreateError(e.message),
  })

  const exactMatch = allTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase())
  const data = [
    ...allTags.map((t) => ({ value: t.id, label: t.name })),
    ...(search.trim() && !exactMatch
      ? [{ value: `${CREATE_PREFIX}${search.trim()}`, label: `+ Buat "${search.trim()}"` }]
      : []),
  ]

  const handleChange = (values: string[]) => {
    const createVal = values.find((v) => v.startsWith(CREATE_PREFIX))
    if (createVal) {
      setPendingName(createVal.slice(CREATE_PREFIX.length))
      onChange(values.filter((v) => !v.startsWith(CREATE_PREFIX)))
    } else {
      onChange(values)
    }
  }

  return (
    <Stack gap={6}>
      <MultiSelect
        label="Tag" placeholder="Cari atau buat tag baru..."
        leftSection={<TbTag size={14} />}
        data={data} value={tagIds} onChange={handleChange}
        searchable searchValue={search} onSearchChange={setSearch} clearable
        renderOption={({ option }) => {
          const tag = allTags.find((t) => t.id === option.value)
          if (!tag) return <Text size="sm">{option.label}</Text>
          return (
            <Group gap={6}>
              <Badge size="xs" color={tag.color} variant="filled" circle>{' '}</Badge>
              <Text size="sm">{tag.name}</Text>
            </Group>
          )
        }}
      />
      {pendingName && (
        <Stack gap={6} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
          <Text size="xs" fw={600}>Pilih warna untuk "{pendingName}"</Text>
          <Group gap={4} wrap="wrap">
            {TAG_COLORS.map((c) => (
              <Tooltip key={c} label={c} withArrow>
                <ColorSwatch color={`var(--mantine-color-${c}-5)`} size={20}
                  style={{ cursor: 'pointer', outline: c === newColor ? '2px solid var(--mantine-color-blue-5)' : undefined, outlineOffset: 2 }}
                  onClick={() => setNewColor(c)} />
              </Tooltip>
            ))}
          </Group>
          {createError && <Text size="xs" c="red">{createError}</Text>}
          <Group gap={6}>
            <Button size="compact-xs" loading={createTag.isPending} onClick={() => createTag.mutate(pendingName)}>Buat Tag</Button>
            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => { setPendingName(null); setCreateError(null) }}>Batal</Button>
          </Group>
        </Stack>
      )}
    </Stack>
  )
}

// ── EventFormView ────────────────────────────────────────────────────────────

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

  const allTags = [...(tagsQ.data?.tags ?? []), ...extraTags.filter((t) => !tagsQ.data?.tags.find((x) => x.id === t.id))]
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
        return api<{ event: TeamEvent }>(`/api/events/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      return api<{ event: TeamEvent }>('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['events'] })
      onSaved((res as { event: TeamEvent }).event.id)
    },
    onError: (e) => setError(e.message),
  })

  if (editId && !initialized) {
    return (
      <Stack gap="md">
        <Button variant="subtle" color="gray" leftSection={<TbArrowLeft size={14} />} onClick={onBack} w="fit-content" size="sm">Kembali</Button>
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
      <Button variant="subtle" color="gray" leftSection={<TbArrowLeft size={14} />} onClick={onBack} w="fit-content" size="sm">
        Kembali
      </Button>

      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Text fw={700} size="lg">{editId ? 'Edit Event' : 'Buat Event Baru'}</Text>

          <TextInput
            label="Judul" placeholder="cth. Meeting mingguan, Review sprint..."
            required value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <DateTimePicker
            label="Waktu mulai" placeholder="Pilih tanggal & jam" required
            value={form.startsAt}
            onChange={(v) => setForm((f) => ({ ...f, startsAt: v ? new Date(v as unknown as string) : null }))}
            clearable highlightToday
          />
          <DateTimePicker
            label="Waktu selesai (opsional)" placeholder="Pilih tanggal & jam"
            value={form.endsAt}
            onChange={(v) => setForm((f) => ({ ...f, endsAt: v ? new Date(v as unknown as string) : null }))}
            clearable minDate={form.startsAt ?? undefined} highlightToday
          />
          <TextInput
            label="Lokasi (opsional)" placeholder="cth. Ruang rapat A, Google Meet..."
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
          <Select
            label="Proyek terkait (opsional)"
            placeholder={projects.length === 0 ? 'Tidak ada proyek tersedia' : 'Pilih proyek...'}
            clearable disabled={projects.length === 0}
            data={projects.map((p) => ({ value: p.id, label: p.name }))}
            value={form.projectId} onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
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
            label="Catatan (opsional)" placeholder="Detail tambahan..." rows={3}
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
