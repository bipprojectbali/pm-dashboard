import {
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  Loader,
  NumberInput,
  PasswordInput,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { TbCheck, TbCopy, TbEye, TbRobot, TbSend } from 'react-icons/tb'

type Settings = Record<string, string>

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
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

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (terbaik, lebih lambat)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (seimbang)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (cepat, hemat)' },
]

export function AiSettingsPanel() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'app-settings'],
    queryFn: () => apiFetch<{ settings: Settings }>('/api/admin/app-settings'),
  })
  const settings = data?.settings ?? {}

  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('claude-opus-4-7')
  const [scheduleHour, setScheduleHour] = useState<number | string>(18)
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setApiKey(settings['ai.anthropicApiKey'] ?? '')
    setBaseUrl(settings['ai.baseUrl'] ?? '')
    setModel(settings['ai.model'] ?? 'claude-opus-4-7')
    setScheduleHour(parseInt(settings['report.scheduleHour'] ?? '18', 10))
    setDirty(false)
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      await Promise.all([
        saveSetting('ai.anthropicApiKey', apiKey),
        saveSetting('ai.baseUrl', baseUrl),
        saveSetting('ai.model', model),
        saveSetting('report.scheduleHour', String(scheduleHour)),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      setDirty(false)
      notifications.show({ color: 'teal', title: 'Tersimpan', message: 'Konfigurasi AI disimpan.' })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Gagal', message: e.message }),
  })

  const previewReport = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; text?: string; error?: string }>('/api/admin/report/preview'),
    onSuccess: (res) => {
      if (res.ok && res.text) {
        setPreview(res.text)
      } else {
        notifications.show({ color: 'red', title: 'Gagal generate', message: res.error ?? 'Unknown error' })
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
        notifications.show({ color: 'red', title: 'Gagal', message: res.message })
      }
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const apiKeySet = settings['ai.anthropicApiKey'] === '***'
  const schedHour = typeof scheduleHour === 'number' ? scheduleHour : parseInt(String(scheduleHour), 10)
  const schedLabel = `${String(schedHour).padStart(2, '0')}:00 WIB`

  return (
    <Stack gap="lg">
      <div>
        <Title order={3}>AI & Laporan Harian</Title>
        <Text c="dimmed" size="sm">Konfigurasi Claude AI untuk laporan naratif harian yang cerdas.</Text>
      </div>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon variant="light" color="violet" size="md" radius="md">
              <TbRobot size={16} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text fw={500} size="sm">Anthropic Claude API</Text>
              <Text size="xs" c="dimmed">API key dari console.anthropic.com</Text>
            </Stack>
          </Group>
          <Divider />

          <PasswordInput
            label="Anthropic API Key"
            placeholder={apiKeySet ? '(sudah tersimpan — kosongkan untuk tidak mengubah)' : 'sk-ant-api03-...'}
            description="Dapatkan di console.anthropic.com → API Keys. Disimpan terenkripsi di database."
            value={apiKey}
            onChange={(e) => { setApiKey(e.currentTarget.value); setDirty(true) }}
          />

          <TextInput
            label="Base URL (opsional)"
            placeholder="https://your-proxy.example.com"
            description="Kosongkan untuk pakai endpoint Anthropic langsung. Isi jika menggunakan proxy/gateway custom. Harus kompatibel dengan Anthropic API (/v1/messages)."
            value={baseUrl}
            onChange={(e) => { setBaseUrl(e.currentTarget.value); setDirty(true) }}
          />

          <Select
            label="Model Claude"
            description="Opus paling cerdas, Haiku paling hemat biaya."
            data={MODEL_OPTIONS}
            value={model}
            onChange={(v) => { if (v) { setModel(v); setDirty(true) } }}
          />

          <NumberInput
            label="Jam kirim laporan (WIB)"
            description={`Laporan dikirim setiap hari jam ${schedLabel}. Server menggunakan UTC+7.`}
            min={0}
            max={23}
            value={scheduleHour}
            onChange={(v) => { setScheduleHour(v); setDirty(true) }}
          />

          <Group justify="flex-end">
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

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Stack gap={0}>
              <Text fw={500} size="sm">Preview & Test Laporan</Text>
              <Text size="xs" c="dimmed">Generate laporan sekarang untuk melihat hasilnya sebelum dikirim.</Text>
            </Stack>
            <Group gap="xs">
              <Button
                variant="light"
                color="violet"
                leftSection={previewReport.isPending ? <Loader size={14} /> : <TbEye size={14} />}
                onClick={() => previewReport.mutate()}
                loading={previewReport.isPending}
                disabled={!apiKeySet && !apiKey}
              >
                Preview Laporan
              </Button>
              <Button
                variant="light"
                color="blue"
                leftSection={<TbSend size={14} />}
                onClick={() => sendNow.mutate()}
                loading={sendNow.isPending}
              >
                Kirim Sekarang
              </Button>
            </Group>
          </Group>

          {preview && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap="xs">
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">Preview Laporan</Text>
                  <Badge size="xs" variant="light" color="violet">{model}</Badge>
                </Group>
                <CopyButton value={preview} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Disalin!' : 'Salin teks'} withArrow>
                      <Button
                        size="xs"
                        variant="subtle"
                        color={copied ? 'teal' : 'gray'}
                        leftSection={copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                        onClick={copy}
                      >
                        {copied ? 'Disalin' : 'Salin'}
                      </Button>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
              <ScrollArea h={400} type="auto">
                <Textarea
                  value={preview}
                  readOnly
                  autosize
                  minRows={10}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 } }}
                />
              </ScrollArea>
            </Stack>
          )}
        </Stack>
      </Card>
    </Stack>
  )
}
