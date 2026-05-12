import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbCalendarEvent,
  TbClock,
  TbTrash,
} from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import {
  type ProjectDetail,
  type ProjectPriority,
  type ProjectStatus,
  type ProjectVisibility,
} from './ProjectsPanel'
import { GithubIntegrationCard } from './GithubIntegrationCard'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const PRIORITY_OPTIONS: Array<{ value: ProjectPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function isSystemAdmin(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

function computeCanManage(myRole: string | null, systemRole: string | null | undefined): boolean {
  if (isSystemAdmin(systemRole)) return true
  return myRole === 'OWNER' || myRole === 'PM'
}

export function ProjectSettingsTab({
  project,
  systemRole,
  onDeleted,
}: {
  project: ProjectDetail
  systemRole: string | null
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [priority, setPriority] = useState<ProjectPriority>(project.priority)
  const [visibility, setVisibility] = useState<ProjectVisibility>(project.visibility)
  const [startsAt, setStartsAt] = useState<Date | null>(project.startsAt ? new Date(project.startsAt) : null)
  const [endsAt, setEndsAt] = useState<Date | null>(project.endsAt ? new Date(project.endsAt) : null)
  const [githubRepoInput, setGithubRepoInput] = useState(project.githubRepo ?? '')

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ project: ProjectDetail }>(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      notifySuccess({ message: 'Project disimpan.' })
    },
    onError: (err) => notifyError(err),
  })

  const remove = useMutation({
    mutationFn: () => api<{ ok: true }>(`/api/projects/${project.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notifySuccess({ message: 'Project dihapus.' })
      onDeleted()
    },
    onError: (err) => notifyError(err),
  })

  const invalidRange = startsAt && endsAt && endsAt < startsAt
  const endChanged = endsAt?.getTime() !== (project.endsAt ? new Date(project.endsAt).getTime() : null)
  const isExtending = project.endsAt && endsAt && endsAt.getTime() > new Date(project.endsAt).getTime()
  const canSave = !!name.trim() && !invalidRange && !update.isPending
  const canManage = computeCanManage(project.myRole, systemRole)
  const canDelete = project.myRole === 'OWNER' || systemRole === 'SUPER_ADMIN'

  const confirmDelete = () => {
    modals.openConfirmModal({
      title: 'Delete project permanently',
      centered: true,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            You're about to delete <b>{project.name}</b>.
          </Text>
          <Text size="sm" c="red">
            This cascades to {project._count.tasks} task(s), {project._count.members} member(s), and{' '}
            {project._count.milestones} milestone(s). This cannot be undone.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Delete forever', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(),
    })
  }

  return (
    <Stack gap="md" maw={720}>
      <Card withBorder padding="md" radius="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Project details
          </Text>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            disabled={!canManage}
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={6}
            disabled={!canManage}
          />
          <Group grow>
            <Select
              label="Status"
              data={STATUS_OPTIONS}
              value={status}
              onChange={(v) => v && setStatus(v as ProjectStatus)}
              disabled={!canManage}
            />
            <Select
              label="Priority"
              data={PRIORITY_OPTIONS}
              value={priority}
              onChange={(v) => v && setPriority(v as ProjectPriority)}
              disabled={!canManage}
            />
          </Group>
          <Select
            label="Visibility"
            description={
              visibility === 'PRIVATE'
                ? 'Hanya anggota proyek yang bisa melihat.'
                : visibility === 'INTERNAL'
                  ? 'Semua user bisa melihat; hanya anggota yang bisa mengubah task.'
                  : 'Semua user bisa melihat; hanya anggota yang bisa mengubah task.'
            }
            data={[
              { value: 'PRIVATE', label: 'Private — member saja' },
              { value: 'INTERNAL', label: 'Internal — semua user bisa lihat' },
              { value: 'PUBLIC', label: 'Public — semua user bisa lihat' },
            ]}
            value={visibility}
            onChange={(v) => v && setVisibility(v as ProjectVisibility)}
            disabled={!canManage}
          />
          <Group grow>
            <DateInput highlightToday
              label="Start date"
              placeholder="Optional"
              value={startsAt}
              onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
              clearable
              leftSection={<TbClock size={14} />}
              disabled={!canManage}
            />
            <DateInput highlightToday
              label="End date"
              placeholder="Optional"
              value={endsAt}
              onChange={(v) => setEndsAt(v ? new Date(v as unknown as string) : null)}
              clearable
              leftSection={<TbCalendarEvent size={14} />}
              error={invalidRange ? 'End must be after start' : undefined}
              disabled={!canManage}
            />
          </Group>
          {project.originalEndAt && (
            <Text size="xs" c="dimmed">
              Original deadline: {formatDate(project.originalEndAt)}
              {isExtending ? ' · you are extending this' : ''}
            </Text>
          )}
          {endChanged && project.originalEndAt && (
            <Text size="xs" c="grape">
              Note: edits to end date via Save don't record a reason. Use the Extensions tab to log an audited
              extension.
            </Text>
          )}
          {update.error && (
            <Text size="sm" c="red">
              {(update.error as Error).message}
            </Text>
          )}
          {canManage && (
            <Group justify="flex-end">
              <Button
                disabled={!canSave}
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    name: name.trim(),
                    description: description.trim() || null,
                    status,
                    priority,
                    visibility,
                    startsAt: startsAt ? startsAt.toISOString() : null,
                    endsAt: endsAt ? endsAt.toISOString() : null,
                  })
                }
              >
                Save changes
              </Button>
            </Group>
          )}
        </Stack>
      </Card>

      <GithubIntegrationCard
        project={project}
        canManage={canManage}
        value={githubRepoInput}
        onChange={setGithubRepoInput}
        onSave={(repo) => update.mutate({ githubRepo: repo })}
        onUnlink={() => update.mutate({ githubRepo: null })}
        saving={update.isPending}
        error={update.error as Error | null}
      />

      {canDelete && (
        <Card withBorder padding="md" radius="md" style={{ borderColor: 'var(--mantine-color-red-4)' }}>
          <Stack gap="sm">
            <Text fw={600} size="sm" c="red">
              Danger zone
            </Text>
            <Text size="sm" c="dimmed">
              Deleting a project permanently removes it along with all its tasks, members, milestones, and activity
              history. This cannot be undone.
            </Text>
            {remove.error && (
              <Text size="sm" c="red">
                {(remove.error as Error).message}
              </Text>
            )}
            <Group>
              <Button
                color="red"
                variant="light"
                leftSection={<TbTrash size={14} />}
                onClick={confirmDelete}
                loading={remove.isPending}
              >
                Delete project
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
