import { Group, MultiSelect, NumberInput, Select, Textarea, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { TbClock, TbTag } from 'react-icons/tb'
import type { TagListItem, TaskKind, TaskPriority } from './types'

type Phase = { id: string; title: string; status: string }

type Props = {
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  kind: TaskKind
  setKind: (v: TaskKind) => void
  priority: TaskPriority
  setPriority: (v: TaskPriority) => void
  startsAt: Date | null
  setStartsAt: (v: Date | null) => void
  dueAt: Date | null
  setDueAt: (v: Date | null) => void
  invalidRange: boolean
  estimateHours: number | string
  setEstimateHours: (v: number | string) => void
  tagIds: string[]
  setTagIds: (v: string[]) => void
  phaseId: string | null
  setPhaseId: (v: string | null) => void
  availableTags: TagListItem[]
  phases: Phase[]
}

export function SingleTaskForm({
  title, setTitle,
  description, setDescription,
  kind, setKind,
  priority, setPriority,
  startsAt, setStartsAt,
  dueAt, setDueAt,
  invalidRange,
  estimateHours, setEstimateHours,
  tagIds, setTagIds,
  phaseId, setPhaseId,
  availableTags,
  phases,
}: Props) {
  return (
    <>
      <TextInput
        label="Title"
        placeholder="What needs to get done?"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        required
      />
      <Textarea
        label="Description"
        placeholder="Context, acceptance criteria, etc."
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        autosize
        minRows={3}
        maxRows={8}
        required
      />
      <Group grow>
        <Select
          label="Kind"
          data={['TASK', 'BUG', 'QC']}
          value={kind}
          onChange={(v) => setKind((v as TaskKind) || 'TASK')}
        />
        <Select
          label="Priority"
          data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
          value={priority}
          onChange={(v) => setPriority((v as TaskPriority) || 'MEDIUM')}
        />
      </Group>
      <Group grow>
        <DateInput
          highlightToday
          label="Start date"
          placeholder="Optional"
          value={startsAt}
          onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
          clearable
        />
        <DateInput
          highlightToday
          label="Due date"
          placeholder="Optional"
          value={dueAt}
          onChange={(v) => setDueAt(v ? new Date(v as unknown as string) : null)}
          clearable
          error={invalidRange ? 'Due must be after start' : undefined}
        />
        <NumberInput
          label="Estimate (hours)"
          placeholder="e.g. 2.5"
          value={estimateHours}
          onChange={setEstimateHours}
          min={0}
          step={0.5}
          decimalScale={2}
          leftSection={<TbClock size={14} />}
        />
      </Group>
      {availableTags.length > 0 && (
        <MultiSelect
          label="Tags"
          placeholder="Pick tags"
          data={availableTags.map((t) => ({ value: t.id, label: t.name }))}
          value={tagIds}
          onChange={setTagIds}
          leftSection={<TbTag size={14} />}
          searchable
          clearable
        />
      )}
      {phases.length > 0 && (
        <Select
          label="Fase"
          placeholder="Tanpa fase"
          data={phases.map((p) => ({ value: p.id, label: p.title }))}
          value={phaseId}
          onChange={setPhaseId}
          clearable
        />
      )}
    </>
  )
}
