import {
  ActionIcon,
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  Loader,
  PasswordInput,
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
import { useState, useEffect, useRef } from 'react'
import { TimePicker } from '@mantine/dates'
import { TbCheck, TbCopy, TbEye, TbPlayerPlay, TbPlugConnected, TbRefresh, TbRobot, TbSend } from 'react-icons/tb'
import { SnapshotHistoryPanel } from './SnapshotHistoryPanel'
import { SendHistoryPanel } from './SendHistoryPanel'

const DEFAULT_INSTRUCTION = `Tulis laporan manajemen harian dalam *bahasa Indonesia*. Format: Telegram Markdown (*bold*, _italic_). Padat, berbasis data, tanpa narasi berlebihan.

Struktur wajib:

*📊 Laporan Harian — {TANGGAL}*
[1 kalimat status keseluruhan: jumlah task aktif, velocity, level risiko]

*Ringkasan Metrik*
• Total task open: X | Overdue: X | Closed 7h: X | Stale: X
• Velocity minggu ini: X task/minggu
• Risiko: [NONE/LOW/MEDIUM/HIGH]

*Status Project* (hanya project ACTIVE)
Untuk setiap project: nama, grade (A–F), skor, open/overdue/blocked, sisa hari. Satu baris per project.

*Performa Tim*
Untuk setiap anggota: nama, open task, overdue, closed 7h. Tandai OVERLOADED jika relevan. Satu baris per orang.

*Tindakan Diperlukan* (maks 3 poin)
Hanya item yang membutuhkan keputusan atau eskalasi — disertai angka dan deadline konkret.

*Tanggapan & Analisis*
Penilaian singkat kondisi hari ini: apa yang berjalan baik, apa yang mengkhawatirkan, pola atau tren yang perlu diperhatikan. Berbasis angka, bukan opini umum.

*Rangkuman Eksekutif*
3–5 poin ringkas kondisi keseluruhan tim dan project. Cocok dibaca dalam 30 detik.

*Saran*
Rekomendasi konkret berbasis data — maks 3 item, masing-masing dengan alasan singkat dan metrik pendukung.

*Tindakan Segera*
Daftar aksi spesifik yang harus diambil besok, dengan penanggung jawab (jika ada dari data tim) dan target waktu.

_pm-dashboard AI report_`

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

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (terbaik, lebih lambat)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (seimbang)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (cepat, hemat)' },
]

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB — Jakarta (UTC+7)', short: 'WIB' },
  { value: 'Asia/Makassar', label: 'WITA — Makassar (UTC+8)', short: 'WITA' },
  { value: 'Asia/Jayapura', label: 'WIT — Jayapura (UTC+9)', short: 'WIT' },
  { value: 'UTC', label: 'UTC (UTC+0)', short: 'UTC' },
]
const DEFAULT_TIMEZONE = 'Asia/Jakarta'
const tzShortLabel = (tz: string) => TIMEZONE_OPTIONS.find((t) => t.value === tz)?.short ?? tz

function getSecondsUntil(h: number, m: number, tz: string): number {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
  const nowSecs = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second')
  const schedSecs = h * 3600 + m * 60
  let delta = schedSecs - nowSecs
  if (delta <= 0) delta += 86400
  return delta
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtLocalTime(tz: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date())
}

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
  const [scheduleTime, setScheduleTime] = useState('18:00')
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [promptInstruction, setPromptInstruction] = useState(DEFAULT_INSTRUCTION)
  const [promptDirty, setPromptDirty] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setApiKey(settings['ai.anthropicApiKey'] ?? '')
    setBaseUrl(settings['ai.baseUrl'] ?? '')
    setModel(settings['ai.model'] ?? 'claude-opus-4-7')
    const h = (settings['report.scheduleHour'] ?? '18').padStart(2, '0')
    const m = (settings['report.scheduleMinute'] ?? '0').padStart(2, '0')
    setScheduleTime(`${h}:${m}`)
    setTimezone(settings['report.timezone'] || DEFAULT_TIMEZONE)
    setPromptInstruction(settings['report.promptInstruction'] ?? DEFAULT_INSTRUCTION)
    setDirty(false)
    setPromptDirty(false)
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      await Promise.all([
        saveSetting('ai.anthropicApiKey', apiKey),
        saveSetting('ai.baseUrl', baseUrl),
        saveSetting('ai.model', model),
        saveSetting('report.scheduleHour', String(parseInt(scheduleTime.split(':')[0], 10))),
        saveSetting('report.scheduleMinute', String(parseInt(scheduleTime.split(':')[1], 10))),
        saveSetting('report.timezone', timezone),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      setDirty(false)
      notifications.show({ color: 'teal', title: 'Tersimpan', message: 'Konfigurasi AI disimpan.' })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Gagal', message: e.message }),
  })

  const savePrompt = useMutation({
    mutationFn: () => saveSetting('report.promptInstruction', promptInstruction),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      setPromptDirty(false)
      notifications.show({ color: 'teal', title: 'Tersimpan', message: 'Instruksi prompt disimpan.' })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Gagal', message: e.message }),
  })

  const previewReport = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; text?: string; error?: string }>('/api/admin/report/preview'),
    onSuccess: (res) => {
      if (res.ok && res.text) {
        setPreview(res.text)
        setEditedReport(res.text)
      } else {
        notifications.show({ color: 'red', title: 'Gagal generate', message: res.error ?? 'Unknown error' })
      }
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const testAi = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/test-ai', { method: 'POST' }),
    onSuccess: (res) => {
      if (res.ok) {
        notifications.show({ color: 'teal', title: 'Koneksi OK', message: res.message })
      } else {
        notifications.show({ color: 'red', title: 'Koneksi gagal', message: res.message })
      }
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const sendNow = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>('/api/admin/report/send-now', { method: 'POST' }),
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

  const [rawPrompt, setRawPrompt] = useState<string | null>(null)
  const [editedReport, setEditedReport] = useState<string | null>(null)

  const triggerCron = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/cron-trigger', { method: 'POST' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'report-send-history'] })
      if (res.ok) notifications.show({ color: 'teal', title: 'Cron berhasil', message: res.message })
      else notifications.show({ color: 'red', title: 'Gagal', message: res.message })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })
  const [countdown, setCountdown] = useState('')
  const [localTime, setLocalTime] = useState('')
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function tick() {
      const [h, m] = scheduleTime.split(':').map(Number)
      if (isNaN(h) || isNaN(m)) return
      setCountdown(fmtCountdown(getSecondsUntil(h, m, timezone)))
      setLocalTime(fmtLocalTime(timezone))
    }
    tick()
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(tick, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [scheduleTime, timezone])

  const fetchPrompt = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; prompt?: string; error?: string }>('/api/admin/report/prompt'),
    onSuccess: (res) => {
      if (res.ok && res.prompt) setRawPrompt(res.prompt)
      else notifications.show({ color: 'red', title: 'Gagal ambil prompt', message: res.error ?? 'Unknown error' })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const sendCustom = useMutation({
    mutationFn: ({ text }: { text: string }) =>
      apiFetch<{ ok: boolean; message: string }>('/api/admin/report/send-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      if (res.ok) notifications.show({ color: 'teal', title: 'Terkirim!', message: res.message })
      else notifications.show({ color: 'red', title: 'Gagal kirim', message: res.message })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const apiKeySet = settings['ai.anthropicApiKey'] === '***'

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

          <Group justify="space-between">
            <Button
              variant="light"
              color="violet"
              leftSection={<TbPlugConnected size={14} />}
              onClick={() => testAi.mutate()}
              loading={testAi.isPending}
              disabled={!apiKeySet && !apiKey}
            >
              Test Koneksi AI
            </Button>
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
          <Stack gap={0}>
            <Text fw={500} size="sm">Jadwal Laporan</Text>
            <Text size="xs" c="dimmed">Laporan harian dikirim otomatis ke Telegram sesuai jam yang dikonfigurasi.</Text>
          </Stack>
          <Divider />
          <Select
            label="Zona waktu laporan"
            description="Jam kirim, label tanggal, dan rollover snapshot harian mengikuti zona ini."
            data={TIMEZONE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
            value={timezone}
            onChange={(v) => { if (v) { setTimezone(v); setDirty(true) } }}
            allowDeselect={false}
          />
          <TimePicker
            label={`Jam kirim laporan (${tzShortLabel(timezone)})`}
            description={`Laporan dikirim setiap hari pada waktu ini menurut ${timezone}.`}
            value={scheduleTime}
            onChange={(v) => { setScheduleTime(v); setDirty(true) }}
          />
          {countdown && (
            <Group
              gap="xs"
              p="sm"
              style={{
                background: 'var(--mantine-color-default-hover)',
                borderRadius: 'var(--mantine-radius-sm)',
              }}
            >
              <Stack gap={2} style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.5 }}>Waktu sekarang ({tzShortLabel(timezone)})</Text>
                <Text size="sm" fw={600} ff="monospace">{localTime}</Text>
              </Stack>
              <Stack gap={2} style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.5 }}>Kirim berikutnya dalam</Text>
                <Text size="sm" fw={700} ff="monospace" c="blue">{countdown}</Text>
              </Stack>
            </Group>
          )}

          <Group justify="space-between">
            <Button
              variant="light"
              color="teal"
              size="xs"
              leftSection={<TbPlayerPlay size={13} />}
              onClick={() => triggerCron.mutate()}
              loading={triggerCron.isPending}
            >
              Simulasi Cron
            </Button>
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
          <Stack gap={0}>
            <Text fw={500} size="sm">Instruksi Prompt</Text>
            <Text size="xs" c="dimmed">
              Instruksi yang dikirim ke AI untuk membentuk laporan. Gunakan <code style={{ fontFamily: 'monospace' }}>{'{TANGGAL}'}</code> sebagai placeholder tanggal. Kosongkan untuk pakai default.
            </Text>
          </Stack>
          <Divider />
          <Textarea
            value={promptInstruction}
            onChange={(e) => { setPromptInstruction(e.currentTarget.value); setPromptDirty(true) }}
            autosize
            minRows={8}
            maxRows={20}
            styles={{ input: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 } }}
          />
          <Group justify="space-between">
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<TbRefresh size={13} />}
              onClick={() => { setPromptInstruction(DEFAULT_INSTRUCTION); setPromptDirty(true) }}
            >
              Reset ke default
            </Button>
            <Button
              leftSection={<TbCheck size={14} />}
              onClick={() => savePrompt.mutate()}
              loading={savePrompt.isPending}
              disabled={!promptDirty}
            >
              Simpan
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={0}>
              <Text fw={500} size="sm">Preview & Kirim</Text>
              <Text size="xs" c="dimmed">Lihat data mentah, generate laporan AI, edit hasilnya, lalu kirim ke Telegram.</Text>
            </Stack>
            <Group gap="xs">
              <Button
                variant="light" color="gray" size="xs"
                leftSection={<TbEye size={13} />}
                onClick={() => fetchPrompt.mutate()}
                loading={fetchPrompt.isPending}
              >
                Lihat Prompt
              </Button>
              <Button
                variant="light" color="violet" size="xs"
                leftSection={previewReport.isPending ? <Loader size={13} /> : <TbRobot size={13} />}
                onClick={() => previewReport.mutate()}
                loading={previewReport.isPending}
                disabled={!apiKeySet && !apiKey}
              >
                Generate AI
              </Button>
              <Button
                variant="light" color="blue" size="xs"
                leftSection={<TbSend size={13} />}
                onClick={() => sendNow.mutate()}
                loading={sendNow.isPending}
                disabled={!apiKeySet && !apiKey}
              >
                Kirim Otomatis
              </Button>
            </Group>
          </Group>

          {(rawPrompt || preview || editedReport) && (
            <div style={{ display: 'grid', gridTemplateColumns: rawPrompt ? '1fr 1fr' : '1fr', gap: 12 }}>
              {rawPrompt && (
                <Stack gap={4}>
                  <Group gap="xs" justify="space-between">
                    <Text size="xs" fw={600} c="dimmed" tt="uppercase">Data Mentah (Prompt)</Text>
                    <CopyButton value={rawPrompt} timeout={2000}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Disalin!' : 'Salin'} withArrow>
                          <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                            {copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Group>
                  <Textarea
                    value={rawPrompt}
                    readOnly
                    autosize
                    minRows={14}
                    maxRows={30}
                    styles={{ input: { fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 } }}
                  />
                </Stack>
              )}

              {(preview || editedReport !== null) && (
                <Stack gap={4}>
                  <Group gap="xs" justify="space-between">
                    <Group gap={6}>
                      <Text size="xs" fw={600} c="dimmed" tt="uppercase">Hasil AI</Text>
                      <Badge size="xs" variant="light" color="violet">{model}</Badge>
                      {editedReport !== null && editedReport !== preview && (
                        <Badge size="xs" variant="light" color="orange">diedit</Badge>
                      )}
                    </Group>
                    <Group gap={4}>
                      <CopyButton value={editedReport ?? preview ?? ''} timeout={2000}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Disalin!' : 'Salin'} withArrow>
                            <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                              {copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                      {editedReport !== null && editedReport !== preview && (
                        <Tooltip label="Reset ke hasil AI" withArrow>
                          <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setEditedReport(preview)}>
                            <TbRefresh size={12} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>
                  <Textarea
                    value={editedReport ?? preview ?? ''}
                    onChange={(e) => setEditedReport(e.currentTarget.value)}
                    autosize
                    minRows={14}
                    maxRows={30}
                    styles={{ input: { fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 } }}
                  />
                  <Group justify="flex-end">
                    <Button.Group>
                      <Button
                        color="teal" size="xs"
                        leftSection={<TbSend size={13} />}
                        onClick={() => sendCustom.mutate({ text: editedReport ?? preview ?? '' })}
                        loading={sendCustom.isPending}
                        disabled={!(editedReport ?? preview)}
                      >
                        Kirim Laporan Ini
                      </Button>
                    </Button.Group>
                  </Group>
                </Stack>
              )}
            </div>
          )}
        </Stack>
      </Card>
      <SendHistoryPanel />
      <SnapshotHistoryPanel />
    </Stack>
  )
}
