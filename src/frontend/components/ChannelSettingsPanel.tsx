import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { TbBrandTelegram, TbCheck, TbSend, TbPlugConnected } from 'react-icons/tb'

type Settings = Record<string, string>

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string }
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function saveSetting(key: string, value: string) {
  return apiFetch('/api/admin/app-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
}

export function ChannelSettingsPanel() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'app-settings'],
    queryFn: () => apiFetch<{ settings: Settings }>('/api/admin/app-settings'),
    staleTime: 0,
  })
  const settings = data?.settings ?? {}

  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!data) return
    setBotToken(settings['telegram.botToken'] ?? '')
    setChatId(settings['telegram.chatId'] ?? '')
    setEnabled(settings['telegram.enabled'] === 'true')
    setDirty(false)
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      await Promise.all([
        saveSetting('telegram.botToken', botToken),
        saveSetting('telegram.chatId', chatId),
        saveSetting('telegram.enabled', enabled ? 'true' : 'false'),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      setDirty(false)
      notifications.show({ color: 'teal', title: 'Tersimpan', message: 'Konfigurasi Telegram disimpan.' })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Gagal', message: e.message }),
  })

  const testTelegram = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/test-telegram', { method: 'POST' }),
    onSuccess: (res) => {
      if (res.ok) {
        notifications.show({ color: 'teal', title: 'Test berhasil!', message: res.message })
      } else {
        notifications.show({ color: 'red', title: 'Test gagal', message: res.message })
      }
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const sendNow = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/send-now', { method: 'POST' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      if (res.ok) {
        notifications.show({ color: 'teal', title: 'Terkirim!', message: res.message })
      } else {
        notifications.show({ color: 'red', title: 'Gagal kirim', message: res.message })
      }
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const lastSent = settings['report.lastSentAt']
  const hasApiKey = !!settings['ai.anthropicApiKey']

  return (
    <Stack gap="lg">
      <div>
        <Title order={3}>Saluran Notifikasi</Title>
        <Text c="dimmed" size="sm">Konfigurasi Telegram untuk laporan harian otomatis.</Text>
      </div>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon variant="light" color="blue" size="md" radius="md">
              <TbBrandTelegram size={16} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text fw={500} size="sm">Telegram Bot</Text>
              <Text size="xs" c="dimmed">Gunakan @BotFather untuk membuat bot dan mendapatkan token.</Text>
            </Stack>
          </Group>
          <Divider />

          <Switch
            label="Aktifkan laporan harian"
            description="Laporan akan dikirim otomatis sesuai jadwal yang dikonfigurasi."
            checked={enabled}
            onChange={(e) => { setEnabled(e.currentTarget.checked); setDirty(true) }}
          />

          <PasswordInput
            label="Bot Token"
            placeholder="123456789:ABCdefGHI..."
            description="Token dari @BotFather. Contoh: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            value={botToken}
            onChange={(e) => { setBotToken(e.currentTarget.value); setDirty(true) }}
          />

          <TextInput
            label="Chat ID"
            placeholder="-100xxxxxxxxxx"
            description="ID group atau channel Telegram. Untuk group: tambahkan bot ke group, lalu gunakan ID negatif (contoh: -1001234567890)."
            value={chatId}
            onChange={(e) => { setChatId(e.currentTarget.value); setDirty(true) }}
          />

          {lastSent && (
            <Group gap="xs">
              <Text size="xs" c="dimmed">Terakhir dikirim:</Text>
              <Badge size="xs" variant="light" color="teal">
                {new Date(lastSent).toLocaleString('id-ID')}
              </Badge>
            </Group>
          )}

          <Group justify="space-between">
            <Group gap="xs">
              <Button
                variant="light"
                color="cyan"
                leftSection={<TbPlugConnected size={14} />}
                onClick={() => testTelegram.mutate()}
                loading={testTelegram.isPending}
                disabled={!chatId || !botToken}
              >
                Test Koneksi
              </Button>
              <Button
                variant="light"
                color="blue"
                leftSection={<TbSend size={14} />}
                onClick={() => sendNow.mutate()}
                loading={sendNow.isPending}
                disabled={!chatId || !botToken || !hasApiKey}
                title={!hasApiKey ? 'Anthropic API key belum dikonfigurasi' : undefined}
              >
                Kirim Laporan
              </Button>
            </Group>
            <Button
              leftSection={<TbCheck size={14} />}
              onClick={() => save.mutate()}
              loading={save.isPending || isLoading}
              disabled={!dirty}
            >
              Simpan
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Stack gap="xs">
          <Text size="sm" fw={500}>Cara setup:</Text>
          <Text size="xs" c="dimmed">1. Buka Telegram, cari @BotFather → /newbot → ikuti instruksi → salin token</Text>
          <Text size="xs" c="dimmed">2. Tambahkan bot ke group Telegram kamu (jadikan admin)</Text>
          <Text size="xs" c="dimmed">3. Kirim pesan di group, lalu buka: https://api.telegram.org/bot{'{TOKEN}'}/getUpdates</Text>
          <Text size="xs" c="dimmed">4. Salin "chat.id" dari response (angka negatif untuk group)</Text>
          <Text size="xs" c="dimmed">5. Isi Bot Token dan Chat ID di atas → Simpan → Kirim Test</Text>
        </Stack>
      </Card>
    </Stack>
  )
}
