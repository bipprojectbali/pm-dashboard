import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Menu,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { useState } from 'react'
import { TbCheck, TbDotsVertical, TbEdit, TbEye, TbPlayerPlay, TbTrash } from 'react-icons/tb'

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
        <Text size="sm" c={phase.description ? undefined : 'dimmed'}>
          {phase.description || 'Tidak ada deskripsi.'}
        </Text>
      </div>
      {phase.status === 'COMPLETED' && (
        <>
          <Divider />
          <Card withBorder radius="sm" p="sm" bg="green.0">
            <Text size="xs" fw={600} mb={4}>
              Kesimpulan
            </Text>
            <Text size="sm" c={phase.summary ? undefined : 'dimmed'}>
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

export function CompletePhaseModal({ phaseName, onConfirm }: { phaseName: string; onConfirm: (summary: string) => void }) {
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
  onSubmit,
}: {
  phase: ProjectPhase
  onSubmit: (data: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState(phase.title)
  const [description, setDescription] = useState(phase.description ?? '')
  const [status, setStatus] = useState<PhaseStatus>(phase.status)
  const [startsAt, setStartsAt] = useState<Date | null>(phase.startsAt ? new Date(phase.startsAt) : null)
  const [endsAt, setEndsAt] = useState<Date | null>(phase.endsAt ? new Date(phase.endsAt) : null)

  const submit = () => {
    if (!title.trim()) return
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      status,
      startsAt: startsAt ? startsAt.toISOString() : null,
      endsAt: endsAt ? endsAt.toISOString() : null,
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
