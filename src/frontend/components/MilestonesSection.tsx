import { Button, Group, Select, SegmentedControl, Stack, Switch, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TbLayoutGrid, TbLayoutList, TbPlus, TbTag } from 'react-icons/tb'
import { type MilestoneFormData, MilestoneEditModal, type TagListItem } from './MilestoneEditModal'
import { MilestoneList } from './milestones/MilestoneCards'
import { api, groupMilestones } from './milestones/helpers'
import type { ProjectMilestone } from './milestones/types'
import { useMilestoneMutations } from './milestones/useMilestoneMutations'

export function MilestonesSection({ projectId, canManage }: { projectId: string; canManage: boolean }) {
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

  const { create, update, remove } = useMilestoneMutations({
    projectId,
    onCreateSuccess: () => setCreateOpen(false),
    onUpdateSuccess: () => setEditTarget(null),
  })

  const milestones = milestonesQ.data?.milestones ?? []
  const availableTags = tagsQ.data?.tags ?? []
  const now = Date.now()

  const tagMap = new Map<string, TagListItem>()
  for (const m of milestones) {
    for (const t of m.tags) tagMap.set(t.tagId, t.tag)
  }
  const allTags = [...tagMap.values()]
  const filtered = tagFilter ? milestones.filter((m) => m.tags.some((t) => t.tagId === tagFilter)) : milestones

  const cardProps = {
    canManage,
    now,
    onToggle: (id: string, done: boolean) => update.mutate({ id, body: { completed: done } }),
    onEdit: (m: ProjectMilestone) => setEditTarget(m),
    onDelete: (m: ProjectMilestone) => { if (confirm(`Hapus milestone "${m.title}"?`)) remove.mutate(m.id) },
    isUpdating: update.isPending,
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

  function renderGrouped() {
    const { groups, untagged } = groupMilestones(filtered)
    if (groups.length === 0 && untagged.length === 0) return <Text size="xs" c="dimmed">Tidak ada milestone.</Text>
    return (
      <Stack gap="md">
        {groups.map(({ tag, items }) => (
          <Stack key={tag.id} gap="xs">
            <Group gap={6}>
              <TbTag size={14} color={`var(--mantine-color-${tag.color}-6)`} />
              <Text size="xs" fw={600} c={`${tag.color}.6`}>{tag.name}</Text>
            </Group>
            <MilestoneList items={items} viewMode={viewMode} cardProps={cardProps} />
          </Stack>
        ))}
        {untagged.length > 0 && (
          <Stack gap="xs">
            <Text size="xs" fw={600} c="dimmed">Tanpa tag</Text>
            <MilestoneList items={untagged} viewMode={viewMode} cardProps={cardProps} />
          </Stack>
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
        <Text size="xs" c="dimmed">Loading&hellip;</Text>
      ) : groupByTag ? (
        renderGrouped()
      ) : (
        <MilestoneList items={filtered} viewMode={viewMode} cardProps={cardProps} />
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
