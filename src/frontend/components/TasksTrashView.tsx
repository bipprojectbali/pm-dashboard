import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Pagination,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbArrowBackUp, TbFlame } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import { useSession } from '../hooks/useAuth'
import { useState } from 'react'

interface TrashTask {
  id: string
  title: string
  kind: string
  status: string
  priority: string
  deleteReason: string | null
  deletedAt: string | null
  project: { id: string; name: string }
  reporter: { id: string; name: string; email: string }
  deletedBy: { id: string; name: string; email: string } | null
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json()
}

const PAGE_SIZE = 25

export function TasksTrashView({ projectId }: { projectId?: string | null }) {
  const qc = useQueryClient()
  const session = useSession()
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(session.data?.user?.role ?? '')
  const [page, setPage] = useState(1)

  const params = new URLSearchParams()
  if (projectId) params.set('projectId', projectId)
  params.set('limit', '500')

  const trashQ = useQuery({
    queryKey: ['tasks-trash', params.toString()],
    queryFn: () => api<{ tasks: TrashTask[] }>(`/api/tasks/trash?${params.toString()}`),
  })

  const restore = useMutation({
    mutationFn: (id: string) =>
      api(`/api/tasks/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-trash'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      notifySuccess({ message: 'Task berhasil di-restore.' })
    },
    onError: (err) => notifyError(err),
  })

  const purge = useMutation({
    mutationFn: (id: string) =>
      api(`/api/tasks/${id}/purge`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-trash'] })
      notifySuccess({ message: 'Task dihapus permanen.' })
    },
    onError: (err) => notifyError(err),
  })

  const confirmPurge = (t: TrashTask) => {
    modals.openConfirmModal({
      title: 'Hapus permanen?',
      children: (
        <Text size="sm">
          "{t.title}" akan dihapus <b>permanen</b> dari database. Tidak bisa dikembalikan.
        </Text>
      ),
      labels: { confirm: 'Hapus Permanen', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => purge.mutate(t.id),
    })
  }

  const tasks = trashQ.data?.tasks ?? []
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = tasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  if (trashQ.isLoading) return <Text size="sm" c="dimmed">Memuat trash...</Text>

  if (tasks.length === 0) {
    return (
      <Card withBorder p="xl" radius="md">
        <Stack align="center" gap="xs">
          <Text fw={500}>Trash kosong</Text>
          <Text size="sm" c="dimmed">Tidak ada task yang dihapus{projectId ? ' di project ini' : ''}.</Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">{tasks.length} task di trash · Otomatis hapus permanen setelah 30 hari</Text>
      <Card withBorder padding={0} radius="md">
        <Stack gap={0}>
          {paged.map((t, i) => (
            <Group
              key={t.id}
              px="md"
              py="sm"
              justify="space-between"
              wrap="nowrap"
              style={{
                borderTop: i > 0 ? '1px solid var(--mantine-color-default-border)' : undefined,
              }}
            >
              <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={500} lineClamp={1}>{t.title}</Text>
                  <Badge size="xs" color="gray" variant="light" style={{ flexShrink: 0 }}>{t.kind}</Badge>
                </Group>
                <Group gap={8} wrap="wrap">
                  <Text size="xs" c="dimmed">{t.project.name}</Text>
                  {t.deletedBy && (
                    <Text size="xs" c="dimmed">
                      Dihapus oleh <b>{t.deletedBy.name}</b>
                      {t.deletedAt ? ` · ${new Date(t.deletedAt).toLocaleDateString('id-ID')}` : ''}
                    </Text>
                  )}
                  {t.deleteReason && (
                    <Text size="xs" c="orange">Alasan: {t.deleteReason}</Text>
                  )}
                </Group>
              </Stack>

              <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                <Tooltip label="Restore task ini" withArrow>
                  <ActionIcon
                    size="sm"
                    variant="light"
                    color="teal"
                    loading={restore.isPending && restore.variables === t.id}
                    onClick={() => restore.mutate(t.id)}
                  >
                    <TbArrowBackUp size={14} />
                  </ActionIcon>
                </Tooltip>
                {isAdmin && (
                  <Tooltip label="Hapus permanen" withArrow>
                    <ActionIcon
                      size="sm"
                      variant="light"
                      color="red"
                      loading={purge.isPending && purge.variables === t.id}
                      onClick={() => confirmPurge(t)}
                    >
                      <TbFlame size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Group>
          ))}
        </Stack>
      </Card>

      {tasks.length > PAGE_SIZE && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, tasks.length)} dari {tasks.length}
          </Text>
          <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Stack>
  )
}
