import { Alert, Button, Card, Group, List, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbBan, TbBell, TbCalendarPlus, TbCircleCheck, TbLock } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../../lib/notify'
import { ExtendDeadlineModal, useExtendDeadline } from '../ExtensionsSection'
import type { ProjectDetail, ProjectLockState } from '../ProjectsPanel'
import { api, formatDate } from './types'

type Disposition = 'COMPLETED' | 'CANCELLED'

// A locked project is served to OWNER/PM as a reduced payload — id/name/status/
// dates only — so this screen must not reach for task lists, members or counts.
export type ProjectLockSubject = Pick<ProjectDetail, 'id' | 'name' | 'endsAt' | 'startsAt'> & {
  taskStats?: ProjectDetail['taskStats']
}

// The view a member who may NOT decide gets. They can no longer open the
// project at all (the API returns 403), so this is rendered standalone from the
// denial — nudging the people who can decide is the only action left to them.
export function ProjectLockedDenied({ projectId }: { projectId: string }) {
  const [requested, setRequested] = useState(false)

  const requestDecision = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; deduped: boolean; notified: number }>(`/api/projects/${projectId}/request-decision`, {
        method: 'POST',
      }),
    // `deduped` means this person already asked within 12 jam — still a success,
    // so the button locks either way and nobody is invited to spam.
    onSuccess: (res) => {
      setRequested(true)
      notifySuccess({
        message: res.deduped
          ? 'Permintaan kamu sebelumnya masih berlaku — pemilik dan admin sudah diberi tahu.'
          : 'Permintaan keputusan terkirim ke pemilik proyek, PM, dan admin.',
      })
    },
    onError: (err) => notifyError(err),
  })

  return (
    <Card withBorder padding="lg" radius="md" style={{ borderColor: 'var(--mantine-color-red-6)' }}>
      <Stack gap="md">
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <ThemeIcon color="red" variant="light" size="xl" radius="md">
            <TbLock size={22} />
          </ThemeIcon>
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Title order={3}>Proyek ini terkunci</Title>
            <Text size="sm" c="dimmed">
              Deadline-nya sudah terlewat tanpa keputusan, jadi proyek ini ditutup sampai pemilik proyek, PM, atau admin
              memutuskan: perpanjang deadline, tandai selesai, atau batalkan. Selama terkunci, isi proyek tidak bisa
              dibuka — termasuk daftar tugas, tim, dan milestone.
            </Text>
          </Stack>
        </Group>
        <Text size="sm">
          Hanya pemilik proyek, PM, atau admin yang bisa membuka kunci ini. Kirim permintaan supaya mereka segera
          memutuskan.
        </Text>
        {requested ? (
          <Alert color="teal" variant="light" icon={<TbBell size={16} />} radius="md">
            Pemilik proyek, PM, dan admin sudah diberi tahu. Tidak perlu mengirim lagi — tunggu keputusan mereka.
          </Alert>
        ) : (
          <Group>
            <Button
              leftSection={<TbBell size={16} />}
              loading={requestDecision.isPending}
              onClick={() => requestDecision.mutate()}
            >
              Minta keputusan
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  )
}

export function ProjectLockedScreen({
  project,
  lock,
  canDecide,
}: {
  project: ProjectLockSubject
  lock: ProjectLockState
  canDecide: boolean
}) {
  const qc = useQueryClient()
  const [extendOpen, setExtendOpen] = useState(false)

  const extend = useExtendDeadline(project.id, () => setExtendOpen(false))

  const dispose = useMutation({
    // The locked PATCH only accepts a body whose single key is `status` — never
    // route this through the project edit form, which sends the whole object.
    mutationFn: (status: Disposition) =>
      api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      notifySuccess({
        message: status === 'COMPLETED' ? 'Proyek ditandai selesai.' : 'Proyek dibatalkan.',
      })
    },
    onError: (err) => notifyError(err),
  })

  const confirmDispose = (status: Disposition) => {
    const selesai = status === 'COMPLETED'
    modals.openConfirmModal({
      title: selesai ? 'Tandai proyek selesai' : 'Batalkan proyek',
      centered: true,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            {selesai ? 'Tandai' : 'Batalkan'} <b>{project.name}</b> {selesai ? 'sebagai selesai?' : 'secara permanen?'}
          </Text>
          <Text size="sm" c="dimmed">
            {selesai
              ? // taskStats is absent from the reduced locked payload — only mention
                // the open-task count when it was actually sent.
                `Status proyek menjadi COMPLETED dan kuncinya terbuka.${
                  project.taskStats ? ` ${project.taskStats.open} tugas masih terbuka dan tidak akan ikut ditutup.` : ''
                }`
              : 'Status proyek menjadi CANCELLED dan kuncinya terbuka. Pekerjaan yang tersisa dianggap tidak dilanjutkan.'}
          </Text>
        </Stack>
      ),
      labels: { confirm: selesai ? 'Tandai selesai' : 'Batalkan proyek', cancel: 'Batal' },
      confirmProps: { color: selesai ? 'teal' : 'red' },
      onConfirm: () => dispose.mutate(status),
    })
  }

  return (
    <Card withBorder padding="lg" radius="md" style={{ borderColor: 'var(--mantine-color-red-6)' }}>
      <Stack gap="md">
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <ThemeIcon color="red" variant="light" size="xl" radius="md">
            <TbLock size={22} />
          </ThemeIcon>
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Title order={3}>Proyek ini terkunci</Title>
            <Text size="sm" c="dimmed">
              Deadline {formatDate(project.endsAt)} sudah terlewat {lock.overdueDays} hari tanpa keputusan, melewati
              masa tenggang {lock.graceDays} hari. Semua perubahan dibekukan sampai ada keputusan.
            </Text>
          </Stack>
        </Group>

        {canDecide ? (
          <Stack gap="sm">
            <Text size="sm" fw={600}>
              Kamu berwenang membuka kunci ini. Pilih satu:
            </Text>
            <List size="sm" spacing={4} c="dimmed">
              <List.Item>Perpanjang deadline bila pekerjaan masih berjalan.</List.Item>
              <List.Item>Tandai selesai bila pekerjaannya sudah beres.</List.Item>
              <List.Item>Batalkan bila proyek ini tidak dilanjutkan.</List.Item>
            </List>
            <Group gap="sm" wrap="wrap">
              <Button leftSection={<TbCalendarPlus size={16} />} onClick={() => setExtendOpen(true)}>
                Perpanjang deadline
              </Button>
              <Button
                variant="light"
                color="teal"
                leftSection={<TbCircleCheck size={16} />}
                loading={dispose.isPending && dispose.variables === 'COMPLETED'}
                onClick={() => confirmDispose('COMPLETED')}
              >
                Tandai selesai
              </Button>
              <Button
                variant="light"
                color="red"
                leftSection={<TbBan size={16} />}
                loading={dispose.isPending && dispose.variables === 'CANCELLED'}
                onClick={() => confirmDispose('CANCELLED')}
              >
                Batalkan proyek
              </Button>
            </Group>
          </Stack>
        ) : (
          // Defensive: the API only serves a locked project to people who can
          // decide, so this is a fallback rather than a path members reach.
          <ProjectLockedDenied projectId={project.id} />
        )}
      </Stack>

      <ExtendDeadlineModal
        opened={extendOpen}
        onClose={() => setExtendOpen(false)}
        currentEndAt={project.endsAt}
        startsAt={project.startsAt}
        onSubmit={(body) => extend.mutate(body)}
        loading={extend.isPending}
        error={extend.error?.message}
      />
    </Card>
  )
}
