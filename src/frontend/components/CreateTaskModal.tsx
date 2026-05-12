import {
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  TbAlertTriangle,
  TbClock,
  TbDownload,
  TbFileImport,
  TbTag,
  TbUpload,
} from 'react-icons/tb'
import { downloadSampleCsv, parseTaskCsv, TASK_CSV_HEADERS, type RowError } from '../lib/csv'
import { notifyError } from '../lib/notify'

type TaskKind = 'TASK' | 'BUG' | 'QC'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface TagListItem {
  id: string
  projectId: string
  name: string
  color: string
}

interface ProjectOption {
  id: string
  name: string
  myRole: 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER' | null
  canWrite?: boolean
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

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

  const [csvText, setCsvText] = useState('')
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
  const totalErrors = (parsed?.errors.length ?? 0) + Array.from(unknownTagsByRow.values()).reduce((a, b) => a + b.length, 0)

  const invalidRange = startsAt && dueAt && dueAt < startsAt
  const availableTags = tagsForProject

  const reset = () => {
    setTitle('')
    setDescription('')
    setStartsAt(null)
    setDueAt(null)
    setEstimateHours('')
    setTagIds([])
    setCsvText('')
  }

  const handlePickFile = async (file: File | null) => {
    if (!file) return
    if (!/\.(csv|txt)$/i.test(file.name)) {
      notifyError(new Error('Hanya file .csv yang didukung'))
      return
    }
    const text = await file.text()
    setCsvText(text)
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
      })),
    })
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {
        reset()
        onClose()
      }}
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
              <DateInput highlightToday
                label="Start date"
                placeholder="Optional"
                value={startsAt}
                onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
                clearable
              />
              <DateInput highlightToday
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
          </>
        ) : (
          <>
            <Group gap="xs" wrap="wrap">
              <FileButton onChange={handlePickFile} accept=".csv,text/csv">
                {(props) => (
                  <Button {...props} variant="light" leftSection={<TbUpload size={14} />}>
                    Upload CSV
                  </Button>
                )}
              </FileButton>
              <Button
                variant="subtle"
                leftSection={<TbDownload size={14} />}
                onClick={() => downloadSampleCsv()}
              >
                Download sample
              </Button>
              {csvText && (
                <Button variant="subtle" color="gray" onClick={() => setCsvText('')}>
                  Clear
                </Button>
              )}
              <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>
                Header wajib: <code>{TASK_CSV_HEADERS.join(',')}</code>
              </Text>
            </Group>
            <Textarea
              label="Atau paste CSV di sini"
              placeholder={`title,description,kind,priority,startsAt,dueAt,estimateHours,assigneeEmail,tagNames\n"Login flow","Email + OAuth",TASK,HIGH,2026-04-25,2026-05-02,6.5,,frontend;auth`}
              value={csvText}
              onChange={(e) => setCsvText(e.currentTarget.value)}
              autosize
              minRows={4}
              maxRows={10}
              styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
            />
            {parsed && (
              <>
                {headerErrors.length > 0 && (
                  <Alert color="red" icon={<TbAlertTriangle size={14} />} title="Header invalid">
                    <Stack gap={2}>
                      {headerErrors.map((e, i) => (
                        <Text key={i} size="xs">
                          {e.message}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}
                {parsed.rows.length > 0 && (
                  <Card withBorder padding="xs" radius="md">
                    <Group justify="space-between" mb="xs">
                      <Text size="sm" fw={500}>
                        Preview · {parsed.rows.length} baris
                      </Text>
                      <Badge color={totalErrors > 0 ? 'red' : 'green'} variant="light">
                        {totalErrors > 0 ? `${totalErrors} error` : 'siap import'}
                      </Badge>
                    </Group>
                    <ScrollArea h={260}>
                      <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>#</Table.Th>
                            <Table.Th>Title</Table.Th>
                            <Table.Th>Kind</Table.Th>
                            <Table.Th>Priority</Table.Th>
                            <Table.Th>Start</Table.Th>
                            <Table.Th>Due</Table.Th>
                            <Table.Th>Est (h)</Table.Th>
                            <Table.Th>Assignee</Table.Th>
                            <Table.Th>Tags</Table.Th>
                            <Table.Th>Errors</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {parsed.rows.map((row, i) => {
                            const errs = errorsByRow.get(i) ?? []
                            const unknownTags = unknownTagsByRow.get(i) ?? []
                            const hasError = errs.length > 0 || unknownTags.length > 0
                            return (
                              <Table.Tr
                                key={i}
                                style={{
                                  backgroundColor: hasError ? 'var(--mantine-color-red-light)' : undefined,
                                }}
                              >
                                <Table.Td>{i + 1}</Table.Td>
                                <Table.Td style={{ maxWidth: 220 }}>
                                  <Text size="xs" lineClamp={2}>
                                    {row.title || <Text component="span" c="red">(missing)</Text>}
                                  </Text>
                                </Table.Td>
                                <Table.Td>{row.kind}</Table.Td>
                                <Table.Td>{row.priority}</Table.Td>
                                <Table.Td>{row.startsAt ? row.startsAt.slice(0, 10) : '—'}</Table.Td>
                                <Table.Td>{row.dueAt ? row.dueAt.slice(0, 10) : '—'}</Table.Td>
                                <Table.Td>{row.estimateHours ?? '—'}</Table.Td>
                                <Table.Td>{row.assigneeEmail ?? '—'}</Table.Td>
                                <Table.Td>{row.tagNames.join(', ') || '—'}</Table.Td>
                                <Table.Td>
                                  {hasError ? (
                                    <Stack gap={2}>
                                      {errs.map((e, j) => (
                                        <Text key={j} size="xs" c="red">
                                          {e.field}: {e.message}
                                        </Text>
                                      ))}
                                      {unknownTags.length > 0 && (
                                        <Text size="xs" c="red">
                                          tag tidak ada di project: {unknownTags.join(', ')}
                                        </Text>
                                      )}
                                    </Stack>
                                  ) : (
                                    <Text size="xs" c="green">
                                      ok
                                    </Text>
                                  )}
                                </Table.Td>
                              </Table.Tr>
                            )
                          })}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Card>
                )}
              </>
            )}
          </>
        )}
        {error ? (
          <Text size="sm" c="red">
            {error}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
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
                })
              }
              disabled={!projectId || !title.trim() || !description.trim() || Boolean(invalidRange) || loading}
              loading={loading}
            >
              Create
            </Button>
          ) : (
            <Button
              leftSection={<TbFileImport size={14} />}
              onClick={submitBulk}
              disabled={
                !projectId || !parsed || parsed.rows.length === 0 || totalErrors > 0 || loading
              }
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
