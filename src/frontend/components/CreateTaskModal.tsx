import { Button, Group, Modal, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbFileImport } from 'react-icons/tb'
import { parseTaskCsv, type RowError } from '../lib/csv'
import { notifyError } from '../lib/notify'
import { BulkCsvForm } from './createtaskmodal/BulkCsvForm'
import { SingleTaskForm } from './createtaskmodal/SingleTaskForm'
import { api, type ProjectOption, type TagListItem, type TaskKind, type TaskPriority } from './createtaskmodal/types'

export function CreateTaskModal({
  opened,
  onClose,
  projects,
  defaultProjectId,
  onSubmit,
  onBulkSubmit,
  loading,
  error,
  tagsByProject,
}: {
  opened: boolean
  onClose: () => void
  projects: ProjectOption[]
  defaultProjectId: string | null
  onSubmit: (body: {
    projectId: string
    title: string
    description: string
    kind: TaskKind
    priority: TaskPriority
    startsAt: string | null
    dueAt: string | null
    estimateHours: number | null
    tagIds: string[]
    phaseId: string | null
  }) => void
  onBulkSubmit: (body: {
    projectId: string
    tasks: Array<{
      title: string
      description: string
      kind: string
      priority: string
      startsAt: string | null
      dueAt: string | null
      estimateHours: number | null
      assigneeEmail: string | null
      tagNames: string[]
      phaseName: string | null
    }>
  }) => void
  loading: boolean
  error?: string
  tagsByProject: TagListItem[]
}) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<TaskKind>('TASK')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [dueAt, setDueAt] = useState<Date | null>(null)
  const [estimateHours, setEstimateHours] = useState<number | string>('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [phaseId, setPhaseId] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')

  const phasesQ = useQuery({
    queryKey: ['phases', projectId, 'modal'],
    queryFn: () => api<{ phases: Array<{ id: string; title: string; status: string }> }>(`/api/projects/${projectId}/phases`),
    enabled: !!projectId,
  })
  const projectTagsQ = useQuery({
    queryKey: ['tags', projectId, 'modal'],
    queryFn: () => api<{ tags: TagListItem[] }>(`/api/projects/${projectId}/tags`),
    enabled: !!projectId,
  })

  const parsed = useMemo(() => (csvText.trim() ? parseTaskCsv(csvText) : null), [csvText])
  const errorsByRow = useMemo(() => {
    const m = new Map<number, RowError[]>()
    if (!parsed) return m
    for (const e of parsed.errors) {
      if (e.index < 0) continue
      const list = m.get(e.index) ?? []
      list.push(e)
      m.set(e.index, list)
    }
    return m
  }, [parsed])
  const headerErrors = parsed?.errors.filter((e) => e.index < 0) ?? []
  const tagsForProject = projectTagsQ.data?.tags ?? tagsByProject.filter((t) => t.projectId === projectId)
  const knownTagNames = new Set(tagsForProject.map((t) => t.name))
  const unknownTagsByRow = useMemo(() => {
    const m = new Map<number, string[]>()
    if (!parsed) return m
    for (let i = 0; i < parsed.rows.length; i++) {
      const unknown = parsed.rows[i].tagNames.filter((n) => !knownTagNames.has(n))
      if (unknown.length) m.set(i, unknown)
    }
    return m
  }, [parsed, knownTagNames])
  const totalErrors =
    (parsed?.errors.length ?? 0) + Array.from(unknownTagsByRow.values()).reduce((a, b) => a + b.length, 0)

  const invalidRange = Boolean(startsAt && dueAt && dueAt < startsAt)
  const availableTags = tagsForProject

  const reset = () => {
    setTitle('')
    setDescription('')
    setStartsAt(null)
    setDueAt(null)
    setEstimateHours('')
    setTagIds([])
    setPhaseId(null)
    setCsvText('')
  }

  const handlePickFile = async (file: File | null) => {
    if (!file) return
    if (!/\.(csv|txt)$/i.test(file.name)) {
      notifyError(new Error('Hanya file .csv yang didukung'))
      return
    }
    setCsvText(await file.text())
  }

  const submitBulk = () => {
    if (!projectId || !parsed || totalErrors > 0 || parsed.rows.length === 0) return
    onBulkSubmit({
      projectId,
      tasks: parsed.rows.map((r) => ({
        title: r.title,
        description: r.description,
        kind: r.kind,
        priority: r.priority,
        startsAt: r.startsAt,
        dueAt: r.dueAt,
        estimateHours: r.estimateHours,
        assigneeEmail: r.assigneeEmail,
        tagNames: r.tagNames,
        phaseName: r.phaseTitle ?? null,
      })),
    })
  }

  return (
    <Modal
      opened={opened}
      onClose={() => { reset(); onClose() }}
      title="Create Task"
      size={mode === 'bulk' ? 'xl' : 'md'}
    >
      <Stack gap="sm">
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as 'single' | 'bulk')}
          data={[
            { value: 'single', label: 'Single' },
            { value: 'bulk', label: 'Bulk CSV' },
          ]}
        />
        <Select
          label="Project"
          data={projects.map((p) => ({ value: p.id, label: p.name }))}
          value={projectId}
          onChange={setProjectId}
          required
        />
        {mode === 'single' ? (
          <SingleTaskForm
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            kind={kind} setKind={setKind}
            priority={priority} setPriority={setPriority}
            startsAt={startsAt} setStartsAt={setStartsAt}
            dueAt={dueAt} setDueAt={setDueAt}
            invalidRange={invalidRange}
            estimateHours={estimateHours} setEstimateHours={setEstimateHours}
            tagIds={tagIds} setTagIds={setTagIds}
            phaseId={phaseId} setPhaseId={setPhaseId}
            availableTags={availableTags}
            phases={phasesQ.data?.phases ?? []}
          />
        ) : (
          <BulkCsvForm
            csvText={csvText} onCsvTextChange={setCsvText}
            onPickFile={handlePickFile}
            parsed={parsed}
            errorsByRow={errorsByRow}
            unknownTagsByRow={unknownTagsByRow}
            headerErrors={headerErrors}
            totalErrors={totalErrors}
          />
        )}
        {error && <Text size="sm" c="red">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          {mode === 'single' ? (
            <Button
              onClick={() =>
                projectId &&
                onSubmit({
                  projectId,
                  title: title.trim(),
                  description: description.trim(),
                  kind,
                  priority,
                  startsAt: startsAt ? startsAt.toISOString() : null,
                  dueAt: dueAt ? dueAt.toISOString() : null,
                  estimateHours: typeof estimateHours === 'number' ? estimateHours : null,
                  tagIds,
                  phaseId,
                })
              }
              disabled={!projectId || !title.trim() || !description.trim() || invalidRange || loading}
              loading={loading}
            >
              Create
            </Button>
          ) : (
            <Button
              leftSection={<TbFileImport size={14} />}
              onClick={submitBulk}
              disabled={!projectId || !parsed || parsed.rows.length === 0 || totalErrors > 0 || loading}
              loading={loading}
            >
              Import {parsed && totalErrors === 0 ? `${parsed.rows.length} task` : ''}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}
