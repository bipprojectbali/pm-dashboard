import { Alert, Badge, Button, Card, Group, Modal, Select, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbBug, TbCheck, TbEdit, TbInfoCircle, TbX } from 'react-icons/tb'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'
import type { ProjectListItem } from '../ProjectsPanel'

interface SelfProject {
  id: string
  name: string
  description: string | null
  githubRepo: string | null
  status: string
  visibility: string
}

export function QcSelfProjectCard() {
  const { data: sessionData } = useSession()
  const isSuperAdmin = sessionData?.user?.role === 'SUPER_ADMIN'
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  const selfQ = useQuery({
    queryKey: ['admin', 'self-project'],
    queryFn: () =>
      fetch('/api/admin/self-project', { credentials: 'include' }).then(
        (r) => r.json() as Promise<{ selfProject: SelfProject | null }>,
      ),
    refetchInterval: 60_000,
  })

  const projectsQ = useQuery({
    queryKey: ['admin', 'projects-for-self'],
    queryFn: () =>
      fetch('/api/projects', { credentials: 'include' }).then(
        (r) => r.json() as Promise<{ projects: ProjectListItem[] }>,
      ),
    enabled: pickerOpen,
  })

  const setMut = useMutation({
    mutationFn: (projectId: string) =>
      fetch('/api/admin/self-project', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`)
        return r.json()
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'self-project'] })
      qc.invalidateQueries({ queryKey: ['qc'] })
      setPickerOpen(false)
      setPicked(null)
      notifySuccess({ title: 'Self-project tersimpan', message: 'Tag ai-queue otomatis dibuat di project ini.' })
    },
    onError: (e: Error) => notifyError({ title: 'Gagal set self-project', message: e.message }),
  })

  const clearMut = useMutation({
    mutationFn: () =>
      fetch('/api/admin/self-project', { method: 'DELETE', credentials: 'include' }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`)
        return r.json()
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'self-project'] })
      qc.invalidateQueries({ queryKey: ['qc'] })
      notifySuccess('Self-project dihapus')
    },
    onError: (e: Error) => notifyError({ title: 'Gagal clear self-project', message: e.message }),
  })

  const projectOptions = useMemo(() => {
    const list = projectsQ.data?.projects ?? []
    return list.map((p) => ({ value: p.id, label: p.name }))
  }, [projectsQ.data])

  const current = selfQ.data?.selfProject ?? null

  const confirmClear = () =>
    modals.openConfirmModal({
      title: 'Hapus self-project?',
      children: (
        <Text size="sm">
          QC ticketing akan nonaktif sampai ada project yang ditandai ulang. Ticket existing tidak dihapus.
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => clearMut.mutate(),
    })

  return (
    <>
      <Card withBorder radius="md" p="md">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon color="red" variant="light" size={42} radius="md">
              <TbBug size={22} />
            </ThemeIcon>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Group gap="xs">
                <Text fw={600}>QC Self-Project</Text>
                <Tooltip
                  label="Project yang ditandai sebagai self-project adalah satu-satunya tempat ticket QC terbit. Tag ai-queue otomatis dibuat di sana supaya Claude bisa pick via MCP."
                  multiline
                  w={280}
                >
                  <ThemeIcon color="gray" variant="subtle" size="sm">
                    <TbInfoCircle size={14} />
                  </ThemeIcon>
                </Tooltip>
              </Group>
              {current ? (
                <Group gap={6} wrap="wrap">
                  <Badge color="red" variant="light" size="sm">
                    Aktif
                  </Badge>
                  <Text size="sm" fw={500} truncate>
                    {current.name}
                  </Text>
                  {current.githubRepo && (
                    <Text size="xs" c="dimmed" truncate>
                      · {current.githubRepo}
                    </Text>
                  )}
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  Belum di-set. QC ticketing nonaktif sampai ada project yang ditandai.
                </Text>
              )}
            </Stack>
          </Group>
          {isSuperAdmin && (
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs"
                variant={current ? 'light' : 'filled'}
                leftSection={<TbEdit size={14} />}
                onClick={() => {
                  setPicked(current?.id ?? null)
                  setPickerOpen(true)
                }}
              >
                {current ? 'Ganti' : 'Set'}
              </Button>
              {current && (
                <Tooltip label="Hapus self-project">
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    leftSection={<TbX size={14} />}
                    onClick={confirmClear}
                    loading={clearMut.isPending}
                  >
                    Hapus
                  </Button>
                </Tooltip>
              )}
            </Group>
          )}
        </Group>
      </Card>

      <Modal
        opened={pickerOpen}
        onClose={() => {
          setPickerOpen(false)
          setPicked(null)
        }}
        title="Pilih self-project"
        centered
      >
        <Stack gap="md">
          <Alert color="blue" icon={<TbInfoCircle size={16} />}>
            Setelah di-set, tag <code>ai-queue</code> otomatis dibuat di project ini. Semua QC ticket akan muncul di
            sini.
          </Alert>
          <Select
            label="Project"
            placeholder="Cari project…"
            data={projectOptions}
            value={picked}
            onChange={setPicked}
            searchable
            nothingFoundMessage="Project tidak ditemukan"
            disabled={projectsQ.isLoading}
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                setPickerOpen(false)
                setPicked(null)
              }}
            >
              Batal
            </Button>
            <Button
              leftSection={<TbCheck size={14} />}
              disabled={!picked || picked === current?.id}
              loading={setMut.isPending}
              onClick={() => picked && setMut.mutate(picked)}
            >
              Simpan
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
