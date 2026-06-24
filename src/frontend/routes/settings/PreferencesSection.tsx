import { Button, Divider, Group, Paper, SegmentedControl, Select, Stack, Switch, Text, ThemeIcon } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbBell, TbCheck, TbLayoutGrid } from 'react-icons/tb'
import { defaultPrefs, type UserPreferences } from './types'

export function PreferencesSection() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: () =>
      fetch('/api/me/preferences', { credentials: 'include' }).then(
        (r) => r.json() as Promise<{ preferences: UserPreferences }>,
      ),
  })
  const [draft, setDraft] = useState<UserPreferences>(defaultPrefs)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data?.preferences) {
      setDraft(data.preferences)
      setDirty(false)
    }
  }, [data?.preferences])

  const save = useMutation({
    mutationFn: (payload: UserPreferences) =>
      fetch('/api/me/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      qc.setQueryData(['me', 'preferences'], res)
      setDirty(false)
      notifications.show({ color: 'teal', title: 'Tersimpan', message: 'Preferensi kamu sudah diperbarui.' })
    },
    onError: () => {
      notifications.show({ color: 'red', title: 'Gagal menyimpan', message: 'Coba lagi beberapa saat lagi.' })
    },
  })

  function set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const reset = () => {
    if (data?.preferences) {
      setDraft(data.preferences)
      setDirty(false)
    }
  }

  return (
    <Stack gap="lg">
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon variant="light" color="blue" size="md" radius="md">
              <TbBell size={16} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text fw={500} size="sm">Notifikasi</Text>
              <Text size="xs" c="dimmed">Pilih kejadian apa yang ingin kamu dapatkan notifikasinya.</Text>
            </Stack>
          </Group>
          <Divider />
          <Switch
            label="Tugas baru ditugaskan ke saya"
            description="Saat PM/owner menetapkan task baru ke akunmu."
            checked={draft.notifyTaskAssigned}
            onChange={(e) => set('notifyTaskAssigned', e.currentTarget.checked)}
          />
          <Switch
            label="Perubahan status tugas saya"
            description="Saat status task kamu berpindah (mis. READY_FOR_QC → CLOSED)."
            checked={draft.notifyTaskStatusChanged}
            onChange={(e) => set('notifyTaskStatusChanged', e.currentTarget.checked)}
          />
          <Switch
            label="Disebut di komentar"
            description="Saat seseorang menyebut @namamu di komentar task."
            checked={draft.notifyMentioned}
            onChange={(e) => set('notifyMentioned', e.currentTarget.checked)}
          />
          <Switch
            label="Tenggat proyek mendekat"
            description="Peringatan saat proyek yang kamu ikuti mendekati deadline (<3 hari)."
            checked={draft.notifyProjectDeadline}
            onChange={(e) => set('notifyProjectDeadline', e.currentTarget.checked)}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon variant="light" color="violet" size="md" radius="md">
              <TbLayoutGrid size={16} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text fw={500} size="sm">Tampilan Manajer Proyek</Text>
              <Text size="xs" c="dimmed">Atur cara default halaman PM dibuka.</Text>
            </Stack>
          </Group>
          <Divider />
          <Select
            label="Tab default saat membuka /pm"
            value={draft.pmDefaultTab}
            onChange={(v) => v && set('pmDefaultTab', v as UserPreferences['pmDefaultTab'])}
            data={[
              { value: 'overview', label: 'Ringkasan' },
              { value: 'projects', label: 'Proyek' },
              { value: 'tasks', label: 'Tugas' },
              { value: 'team', label: 'Tim' },
            ]}
          />
          <Select
            label="Filter tugas default"
            description="Filter yang terpasang otomatis saat pertama kali buka tab Tugas."
            value={draft.tasksDefaultFilter}
            onChange={(v) => v && set('tasksDefaultFilter', v as UserPreferences['tasksDefaultFilter'])}
            data={[
              { value: 'mine', label: 'Tugas saya' },
              { value: 'all', label: 'Semua tugas' },
              { value: 'priority', label: 'Prioritas tinggi dulu' },
            ]}
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>Kepadatan tabel</Text>
            <SegmentedControl
              value={draft.tableDensity}
              onChange={(v) => set('tableDensity', v as UserPreferences['tableDensity'])}
              data={[
                { value: 'comfortable', label: 'Nyaman' },
                { value: 'compact', label: 'Padat' },
              ]}
            />
          </Stack>
        </Stack>
      </Paper>

      <Group justify="flex-end">
        <Button variant="subtle" onClick={reset} disabled={!dirty || save.isPending}>Batal</Button>
        <Button
          leftSection={<TbCheck size={14} />}
          onClick={() => save.mutate(draft)}
          loading={save.isPending}
          disabled={!dirty}
        >
          Simpan perubahan
        </Button>
      </Group>
    </Stack>
  )
}
