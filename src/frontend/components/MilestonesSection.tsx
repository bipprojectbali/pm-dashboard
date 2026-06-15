import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbLayoutGrid, TbLayoutList, TbPencil, TbPlus, TbTag, TbTrash } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import { type MilestoneFormData, MilestoneEditModal, type TagListItem } from './MilestoneEditModal'

interface MilestoneTagEntry {
  tagId: string
  tag: TagListItem
}

interface ProjectMilestone {
  id: string
  projectId: string
  title: string
  description: string | null
  dueAt: string | null
  completedAt: string | null
  order: number
  createdAt: string
  updatedAt: string
  tags: MilestoneTagEntry[]
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function groupMilestones(ms: ProjectMilestone[]) {
  const groups = new Map<string, { tag: TagListItem; items: ProjectMilestone[] }>()
  const untagged: ProjectMilestone[] = []
  for (const m of ms) {
    if (!m.tags.length) {
      untagged.push(m)
      continue
    }
    const first = m.tags[0].tag
    if (!groups.has(first.id)) groups.set(first.id, { tag: first, items: [] })
    groups.get(first.id)!.items.push(m)
  }
  return { groups: [...groups.values()], untagged }
}

interface MilestoneCardProps {
  m: ProjectMilestone
  canManage: boolean
  now: number
  onToggle: (id: string, done: boolean) => void
  onEdit: (m: ProjectMilestone) => void
  onDelete: (m: ProjectMilestone) => void
  isUpdating: boolean
}

function MilestoneRow({ m, canManage, now, onToggle, onEdit, onDelete, isUpdating }: MilestoneCardProps) {
  const done = !!m.completedAt
  const overdue = !done && !!m.dueAt && new Date(m.dueAt).getTime() < now
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
        <Checkbox
          checked={done}
          disabled={!canManage || isUpdating}
          onChange={(e) => onToggle(m.id, e.currentTarget.checked)}
        />
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} truncate td={done ? 'line-through' : undefined} c={done ? 'dimmed' : undefined}>
            {m.title}
          </Text>
          {m.description && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {m.description}
            </Text>
          )}
          <Group gap={4} wrap="wrap">
            {m.dueAt && (
              <Text size="xs" c={overdue ? 'red' : 'dimmed'}>
                Due {formatDate(m.dueAt)}
              </Text>
            )}
            {overdue && (
              <Badge size="xs" color="red" variant="light">
                Overdue
              </Badge>
            )}
            {done && (
              <Text size="xs" c="dimmed">
                · Done {formatDate(m.completedAt)}
              </Text>
            )}
            {m.tags.map((t) => (
              <Badge key={t.tagId} size="xs" color={t.tag.color} variant="light">
                {t.tag.name}
              </Badge>
            ))}
          </Group>
        </Stack>
      </Group>
      {canManage && (
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Edit">
            <ActionIcon variant="subtle" size="sm" onClick={() => onEdit(m)}>
              <TbPencil size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Hapus">
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(m)}>
              <TbTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Group>
  )
}

function MilestoneGridCard({ m, canManage, now, onToggle, onEdit, onDelete, isUpdating }: MilestoneCardProps) {
  const done = !!m.completedAt
  const overdue = !done && !!m.dueAt && new Date(m.dueAt).getTime() < now
  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Checkbox
              checked={done}
              disabled={!canManage || isUpdating}
              onChange={(e) => onToggle(m.id, e.currentTarget.checked)}
            />
            <Text
              size="sm"
              fw={600}
              truncate
              td={done ? 'line-through' : undefined}
              c={done ? 'dimmed' : undefined}
              style={{ flex: 1 }}
            >
              {m.title}
            </Text>
          </Group>
          {canManage && (
            <Group gap={2} wrap="nowrap">
              <ActionIcon variant="subtle" size="sm" onClick={() => onEdit(m)}>
                <TbPencil size={13} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(m)}>
                <TbTrash size={13} />
              </ActionIcon>
            </Group>
          )}
        </Group>
        {m.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {m.description}
          </Text>
        )}
        <Group gap={4} wrap="wrap">
          {m.dueAt && (
            <Text size="xs" c={overdue ? 'red' : 'dimmed'}>
              {overdue ? '⚠ ' : ''}Due {formatDate(m.dueAt)}
            </Text>
          )}
          {done && (
            <Text size="xs" c="green">
              ✓ Done {formatDate(m.completedAt)}
            </Text>
          )}
        </Group>
        {m.tags.length > 0 && (
          <Group gap={4} wrap="wrap">
            {m.tags.map((t) => (
              <Badge key={t.tagId} size="xs" color={t.tag.color} variant="light">
                {t.tag.name}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </Card>
  )
}

export function MilestonesSection({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [groupByTag, setGroupByTag] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectMilestone | null>(null)

  const milestonesQ = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: () => api<{ milestones: ProjectMilestone[] }>(`/api/projects/${projectId}/milestones`),
  })

  const tagsQ = useQuery({
    queryKey: ['tags', projectId],
    queryFn: () => api<{ tags: TagListItem[] }>(`/api/projects/${projectId}/tags`),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['milestones', projectId] })
    qc.invalidateQueries({ queryKey: ['milestones', 'all'] })
    qc.invalidateQueries({ queryKey: ['projects'] })
  }

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      setCreateOpen(false)
      notifySuccess({ message: 'Milestone dibuat.' })
    },
    onError: (err) => notifyError(err),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/milestones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      setEditTarget(null)
      notifySuccess({ message: 'Milestone diperbarui.' })
    },
    onError: (err) => notifyError(err),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/milestones/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      notifySuccess({ message: 'Milestone dihapus.' })
    },
    onError: (err) => notifyError(err),
  })

  const milestones = milestonesQ.data?.milestones ?? []
  const availableTags = tagsQ.data?.tags ?? []
  const now = Date.now()

  const tagMap = new Map<string, TagListItem>()
  for (const m of milestones) {
    for (const t of m.tags) {
      tagMap.set(t.tagId, t.tag)
    }
  }
  const allTags = [...tagMap.values()]

  const filtered = tagFilter ? milestones.filter((m) => m.tags.some((t) => t.tagId === tagFilter)) : milestones

  function handleToggle(id: string, done: boolean) {
    update.mutate({ id, body: { completed: done } })
  }

  function handleEdit(m: ProjectMilestone) {
    setEditTarget(m)
  }

  function handleDelete(m: ProjectMilestone) {
    if (confirm(`Hapus milestone "${m.title}"?`)) remove.mutate(m.id)
  }

  function handleCreateSubmit(data: MilestoneFormData) {
    create.mutate({
      title: data.title,
      description: data.description || null,
      dueAt: data.dueAt ? data.dueAt.toISOString() : null,
      tagIds: data.tagIds,
    })
  }

  function handleEditSubmit(data: MilestoneFormData) {
    if (!editTarget) return
    update.mutate({
      id: editTarget.id,
      body: {
        title: data.title,
        description: data.description || null,
        dueAt: data.dueAt ? data.dueAt.toISOString() : null,
        tagIds: data.tagIds,
      },
    })
  }

  const itemProps = {
    canManage,
    now,
    onToggle: handleToggle,
    onEdit: handleEdit,
    onDelete: handleDelete,
    isUpdating: update.isPending,
  }

  function renderItems(items: ProjectMilestone[]) {
    if (!items.length) return <Text size="xs" c="dimmed">Tidak ada milestone.</Text>
    if (viewMode === 'grid') {
      return (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
          {items.map((m) => <MilestoneGridCard key={m.id} m={m} {...itemProps} />)}
        </SimpleGrid>
      )
    }
    return (
      <Stack gap={6}>
        {items.map((m) => <MilestoneRow key={m.id} m={m} {...itemProps} />)}
      </Stack>
    )
  }

  function renderGrouped() {
    const { groups, untagged } = groupMilestones(filtered)
    return (
      <Stack gap="md">
        {groups.map(({ tag, items }) => (
          <Stack key={tag.id} gap="xs">
            <Group gap={6}>
              <TbTag size={14} color={`var(--mantine-color-${tag.color}-6)`} />
              <Text size="xs" fw={600} c={`${tag.color}.6`}>
                {tag.name}
              </Text>
            </Group>
            {renderItems(items)}
          </Stack>
        ))}
        {untagged.length > 0 && (
          <Stack gap="xs">
            <Text size="xs" fw={600} c="dimmed">Tanpa tag</Text>
            {renderItems(untagged)}
          </Stack>
        )}
        {groups.length === 0 && untagged.length === 0 && (
          <Text size="xs" c="dimmed">Tidak ada milestone.</Text>
        )}
      </Stack>
    )
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="wrap">
          {allTags.length > 0 && (
            <Select
              size="xs"
              placeholder="Filter tag"
              data={allTags.map((t) => ({ value: t.id, label: t.name }))}
              value={tagFilter}
              onChange={setTagFilter}
              clearable
              w={140}
            />
          )}
          {allTags.length > 0 && (
            <Switch
              size="xs"
              label="Group by tag"
              checked={groupByTag}
              onChange={(e) => setGroupByTag(e.currentTarget.checked)}
            />
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
          <SegmentedControl
            size="xs"
            value={viewMode}
            onChange={(v) => setViewMode(v as 'list' | 'grid')}
            data={[
              { value: 'list', label: <TbLayoutList size={14} /> },
              { value: 'grid', label: <TbLayoutGrid size={14} /> },
            ]}
          />
          {canManage && (
            <Button size="xs" leftSection={<TbPlus size={13} />} onClick={() => setCreateOpen(true)}>
              Tambah
            </Button>
          )}
        </Group>
      </Group>

      {milestonesQ.isLoading ? (
        <Text size="xs" c="dimmed">Loading…</Text>
      ) : groupByTag ? (
        renderGrouped()
      ) : filtered.length === 0 ? (
        <Text size="xs" c="dimmed">Tidak ada milestone.</Text>
      ) : (
        renderItems(filtered)
      )}

      <MilestoneEditModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
        isPending={create.isPending}
        availableTags={availableTags}
      />

      {editTarget && (
        <MilestoneEditModal
          opened={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={handleEditSubmit}
          isPending={update.isPending}
          availableTags={availableTags}
          initialData={{
            title: editTarget.title,
            description: editTarget.description,
            dueAt: editTarget.dueAt,
            tagIds: editTarget.tags.map((t) => t.tagId),
          }}
        />
      )}
    </Stack>
  )
}
