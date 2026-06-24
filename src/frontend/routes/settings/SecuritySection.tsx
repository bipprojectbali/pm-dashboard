import { Badge, Button, Divider, Group, Paper, PasswordInput, Stack, Text, ThemeIcon } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck, TbClock, TbKey, TbLock, TbX } from 'react-icons/tb'
import type { MyAudit, MySession } from './types'

function auditColor(action: string): string {
  if (action === 'LOGIN') return 'teal'
  if (action === 'LOGOUT') return 'gray'
  if (action === 'LOGIN_FAILED') return 'red'
  if (action === 'LOGIN_BLOCKED') return 'red'
  return 'blue'
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

export function SecuritySection() {
  const qc = useQueryClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const { data: sessionsData } = useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: () =>
      fetch('/api/me/sessions', { credentials: 'include' }).then((r) => r.json() as Promise<{ sessions: MySession[] }>),
    refetchInterval: 60_000,
  })
  const { data: auditData } = useQuery({
    queryKey: ['me', 'audit'],
    queryFn: () =>
      fetch('/api/me/audit', { credentials: 'include' }).then((r) => r.json() as Promise<{ logs: MyAudit[] }>),
  })

  const sessions = sessionsData?.sessions ?? []
  const otherSessions = sessions.filter((s) => !s.isCurrent)
  const auditLogs = auditData?.logs ?? []

  const changePwd = useMutation({
    mutationFn: async (payload: { currentPassword: string; newPassword: string }) => {
      const r = await fetch('/api/me/password', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body?.error ?? 'Gagal mengubah password')
      return body
    },
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      notifications.show({ color: 'teal', title: 'Password diubah', message: 'Password kamu sudah diperbarui.' })
    },
    onError: (e: Error) => {
      notifications.show({ color: 'red', title: 'Gagal mengubah password', message: e.message })
    },
  })

  const revokeOthers = useMutation({
    mutationFn: () =>
      fetch('/api/me/sessions/others', { method: 'DELETE', credentials: 'include' }).then((r) => r.json()),
    onSuccess: (res: { revoked?: number }) => {
      qc.invalidateQueries({ queryKey: ['me', 'sessions'] })
      notifications.show({
        color: 'teal',
        title: 'Sesi lain dicabut',
        message: `${res.revoked ?? 0} sesi lain berhasil dicabut.`,
      })
    },
  })

  const submitPwd = () => {
    if (newPassword.length < 8) {
      notifications.show({ color: 'red', title: 'Password terlalu pendek', message: 'Minimal 8 karakter.' })
      return
    }
    if (newPassword !== confirmPassword) {
      notifications.show({
        color: 'red',
        title: 'Konfirmasi tidak cocok',
        message: 'Password baru dan konfirmasi harus sama.',
      })
      return
    }
    changePwd.mutate({ currentPassword, newPassword })
  }

  return (
    <Stack gap="lg">
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon variant="light" color="blue" size="md" radius="md">
              <TbLock size={16} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text fw={500} size="sm">Ubah Password</Text>
              <Text size="xs" c="dimmed">Gunakan password yang tidak dipakai di layanan lain.</Text>
            </Stack>
          </Group>
          <Divider />
          <PasswordInput
            label="Password saat ini"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Password baru"
            description="Minimal 8 karakter."
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Konfirmasi password baru"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            required
          />
          <Group justify="flex-end">
            <Button
              leftSection={<TbCheck size={14} />}
              onClick={submitPwd}
              loading={changePwd.isPending}
              disabled={!currentPassword || !newPassword || !confirmPassword}
            >
              Ubah password
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Group gap="xs">
              <ThemeIcon variant="light" color="teal" size="md" radius="md">
                <TbKey size={16} />
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={500} size="sm">Sesi Aktif ({sessions.length})</Text>
                <Text size="xs" c="dimmed">Perangkat/browser yang sedang masuk dengan akunmu.</Text>
              </Stack>
            </Group>
            {otherSessions.length > 0 && (
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<TbX size={12} />}
                onClick={() => revokeOthers.mutate()}
                loading={revokeOthers.isPending}
              >
                Cabut yang lain ({otherSessions.length})
              </Button>
            )}
          </Group>
          <Divider />
          {sessions.length === 0 ? (
            <Text size="xs" c="dimmed">Tidak ada sesi aktif.</Text>
          ) : (
            <Stack gap="xs">
              {sessions.map((s) => (
                <Group key={s.id} justify="space-between" wrap="nowrap">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Group gap={6}>
                      <Text size="sm" fw={500}>{s.isCurrent ? 'Sesi ini' : 'Sesi lain'}</Text>
                      {s.isCurrent && (
                        <Badge size="xs" color="teal" variant="light">aktif</Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      Dibuat {formatDateTime(s.createdAt)} · kadaluarsa {formatDateTime(s.expiresAt)}
                    </Text>
                  </Stack>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" color="orange" size="md" radius="md">
              <TbClock size={16} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text fw={500} size="sm">Aktivitas Masuk Terkini</Text>
              <Text size="xs" c="dimmed">
                Riwayat login, logout, dan upaya gagal dalam 20 kejadian terakhir.
              </Text>
            </Stack>
          </Group>
          <Divider />
          {auditLogs.length === 0 ? (
            <Text size="xs" c="dimmed">Belum ada riwayat.</Text>
          ) : (
            <Stack gap={6}>
              {auditLogs.map((log) => (
                <Group key={log.id} justify="space-between" wrap="nowrap">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Group gap={6}>
                      <Badge size="xs" color={auditColor(log.action)} variant="light">
                        {log.action}
                      </Badge>
                      {log.ip && <Text size="xs" c="dimmed">{log.ip}</Text>}
                    </Group>
                    {log.detail && (
                      <Text size="xs" c="dimmed" truncate>{log.detail}</Text>
                    )}
                  </Stack>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(log.createdAt)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  )
}
