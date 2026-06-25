import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Menu,
  MultiSelect,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbCheck, TbDotsVertical, TbEdit, TbEye, TbPlayerPlay, TbPlus, TbTag, TbTrash } from 'react-icons/tb'

export type PhaseStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED'

export interface ProjectPhase {
  id: string
  projectId: string
  title: string
  description: string | null
  summary: string | null
  status: PhaseStatus
  order: number
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  _count: { tasks: number }
  tags: Array<{ tagId: string; tag: { id: string; name: string; color: string } }>
}

export interface TagOption {
  id: string
  name: string
  color: string
}

export const PHASE_STATUS_COLOR: Record<PhaseStatus, string> = {
  PLANNING: 'gray',
  ACTIVE: 'blue',
  COMPLETED: 'green',
}

const STATUS_OPTIONS = [
  { value: 'PLANNING', label: 'Planning' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
]

export function formatPhaseDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PhaseDetailModal({ phase }: { phase: ProjectPhase }) {
  const range =
    phase.startsAt || phase.endsAt
      ? `${formatPhaseDate(phase.startsAt) ?? '?'} – ${formatPhaseDate(phase.endsAt) ?? '?'}`
      : null
  return (
    <Stack gap="sm">
      <Group gap={6} wrap="wrap">
        <Badge size="sm" color={PHASE_STATUS_COLOR[phase.status]} variant="light">
          {phase.status}
        </Badge>
        <Badge size="sm" variant="default" color="gray">
          {phase._count.tasks} task
        </Badge>
        {phase.tags.map(({ tag }) => (
          <Badge key={tag.id} size="sm" color={tag.color} variant="light">
            {tag.name}
          </Badge>
        ))}
      </Group>
      {range && (
        <div>
          <Text size="xs" fw={600} c="dimmed">
            Periode
          </Text>
          <Text size="sm">{range}</Text>
        </div>
      )}
      <div>
        <Text size="xs" fw={600} c="dimmed">
          Deskripsi
        </Text>
        <Text size="sm" c={phase.description ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
          {phase.description || 'Tidak ada deskripsi.'}
        </Text>
      </div>
      {phase.status === 'COMPLETED' && (
        <>
          <Divider />
          <Card withBorder radius="sm" p="sm" bg="var(--mantine-color-green-light)">
            <Text size="xs" fw={600} mb={4} c="var(--mantine-color-green-light-color)">
              Kesimpulan
            </Text>
            <Text size="sm" c={phase.summary ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
              {phase.summary || 'Tidak ada kesimpulan.'}
            </Text>
          </Card>
        </>
      )}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Tutup
        </Button>
      </Group>
    </Stack>
  )
}

export function EditSummaryModal({
  phase,
  onConfirm,
}: {
  phase: ProjectPhase
  onConfirm: (summary: string | null) => void
}) {
  const [summary, setSummary] = useState(phase.summary ?? '')
  return (
    <Stack gap="sm">
      <Textarea
        label="Kesimpulan"
        placeholder="Apa yang dicapai, pelajaran yang dipetik…"
        value={summary}
        onChange={(e) => setSummary(e.currentTarget.value)}
        autosize
        minRows={4}
        data-autofocus
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Batal
        </Button>
        <Button
          color="green"
          size="xs"
          onClick={() => {
            onConfirm(summary.trim() || null)
            modals.closeAll()
          }}
        >
          Simpan
        </Button>
      </Group>
    </Stack>
  )
}

export function CompletePhaseModal({
  phaseName,
  onConfirm,
}: {
  phaseName: string
  onConfirm: (summary: string) => void
}) {
  const [summary, setSummary] = useState('')
  return (
    <Stack gap="sm">
      <Text size="sm">
        Fase <b>"{phaseName}"</b> akan ditandai selesai.
      </Text>
      <Textarea
        label="Kesimpulan (opsional)"
        placeholder="Apa yang dicapai, pelajaran yang dipetik…"
        value={summary}
        onChange={(e) => setSummary(e.currentTarget.value)}
        autosize
        minRows={3}
        data-autofocus
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Batal
        </Button>
        <Button
          color="green"
          size="xs"
          onClick={() => {
            onConfirm(summary)
            modals.closeAll()
          }}
        >
          Tandai Selesai
        </Button>
      </Group>
    </Stack>
  )
}

export function PhaseActionsMenu({
  phase,
  onView,
  onStart,
  onComplete,
  onEdit,
  onDelete,
}: {
  phase: ProjectPhase
  onView: () => void
  onStart: () => void
  onComplete: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label={`Kelola fase ${phase.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <TbDotsVertical size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item leftSection={<TbEye size={14} />} onClick={onView}>
          Lihat Detail
        </Menu.Item>
        {phase.status === 'PLANNING' && (
          <Menu.Item leftSection={<TbPlayerPlay size={14} />} onClick={onStart}>
            Mulai Fase
          </Menu.Item>
        )}
        {phase.status === 'ACTIVE' && (
          <Menu.Item leftSection={<TbCheck size={14} />} onClick={onComplete}>
            Selesaikan Fase
          </Menu.Item>
        )}
        <Menu.Item leftSection={<TbEdit size={14} />} onClick={onEdit}>
          Edit Fase
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<TbTrash size={14} />} onClick={onDelete}>
          Hapus Fase
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

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
  const [tagIds, setTagIds] = useState<string[]>(phase.tags.map((t) => t.tagId))
  const [localTags, setLocalTags] = useState<TagOption[]>([])
  const [newTagName, setNewTagName] = useState('')

  const allTags = useMemo(
    () => [...availableTags, ...localTags.filter((lt) => !availableTags.some((at) => at.id === lt.id))],
    [availableTags, localTags],
  )

  const createTag = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/projects/${phase.projectId}/tags`, {
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
      qc.invalidateQueries({ queryKey: ['tags', phase.projectId] })
    },
  })

  const submit = () => {
    if (!title.trim()) return
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
      <MultiSelect
        label="Tags"
        placeholder="Pilih tag"
        data={allTags.map((t) => ({ value: t.id, label: t.name }))}
        value={tagIds}
        onChange={setTagIds}
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
