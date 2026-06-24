import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Stack, Text, Title } from '@mantine/core'
import { ClaudeApiCard } from './aisettingspanel/ClaudeApiCard'
import { DEFAULT_TIMEZONE, apiFetch, fmtCountdown, fmtLocalTime, getSecondsUntil, saveSetting } from './aisettingspanel/constants'
import { DEFAULT_INSTRUCTION } from './aisettingspanel/constants'
import { PreviewSendCard } from './aisettingspanel/PreviewSendCard'
import { PromptInstructionCard } from './aisettingspanel/PromptInstructionCard'
import { ReportScheduleCard } from './aisettingspanel/ReportScheduleCard'
import { useReportStream } from './aisettingspanel/useReportStream'
import { ReportHistoryPanel } from './ReportHistoryPanel'
import { SnapshotHistoryPanel } from './SnapshotHistoryPanel'

type Settings = Record<string, string>

export function AiSettingsPanel({ showDeleteHistory }: { showDeleteHistory?: boolean } = {}) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'app-settings'],
    queryFn: () => apiFetch<{ settings: Settings }>('/api/admin/app-settings'),
  })
  const settings = data?.settings ?? {}

  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('claude-opus-4-7')
  const [embApiKey, setEmbApiKey] = useState('')
  const [embBaseUrl, setEmbBaseUrl] = useState('')
  const [embModel, setEmbModel] = useState('')
  const [timeoutSeconds, setTimeoutSeconds] = useState(120)
  const [scheduleTime, setScheduleTime] = useState('18:00')
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [promptInstruction, setPromptInstruction] = useState(DEFAULT_INSTRUCTION)
  const [promptDirty, setPromptDirty] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [rawPrompt, setRawPrompt] = useState<string | null>(null)
  const [editedReport, setEditedReport] = useState<string | null>(null)
  const [testAiCooldown, setTestAiCooldown] = useState(0)
  const testAiCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [countdown, setCountdown] = useState('')
  const [localTime, setLocalTime] = useState('')
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!data) return
    setApiKey(settings['ai.anthropicApiKey'] ?? '')
    setBaseUrl(settings['ai.baseUrl'] ?? '')
    setModel(settings['ai.model'] ?? 'claude-opus-4-7')
    setEmbApiKey(settings['embedding.apiKey'] ?? '')
    setEmbBaseUrl(settings['embedding.baseUrl'] ?? '')
    setEmbModel(settings['embedding.model'] ?? '')
    setTimeoutSeconds(Number(settings['ai.timeoutSeconds'] ?? 120))
    const h = (settings['report.scheduleHour'] ?? '18').padStart(2, '0')
    const m = (settings['report.scheduleMinute'] ?? '0').padStart(2, '0')
    setScheduleTime(`${h}:${m}`)
    setTimezone(settings['report.timezone'] || DEFAULT_TIMEZONE)
    setPromptInstruction(settings['report.promptInstruction'] ?? DEFAULT_INSTRUCTION)
    setDirty(false)
    setPromptDirty(false)
  }, [data, settings['report.timezone'], settings['report.scheduleMinute'], settings['report.scheduleHour'], settings['embedding.baseUrl'], settings['report.promptInstruction'], settings['embedding.apiKey'], settings['ai.baseUrl'], settings['embedding.model'], settings['ai.timeoutSeconds'], settings['ai.model'], settings['ai.anthropicApiKey']])

  useEffect(() => {
    function tick() {
      const [h, m] = scheduleTime.split(':').map(Number)
      if (Number.isNaN(h) || Number.isNaN(m)) return
      setCountdown(fmtCountdown(getSecondsUntil(h, m, timezone)))
      setLocalTime(fmtLocalTime(timezone))
    }
    tick()
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(tick, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [scheduleTime, timezone])

  const startCooldown = useCallback(() => {
    setTestAiCooldown(15)
    testAiCooldownRef.current = setInterval(() => {
      setTestAiCooldown((v) => {
        if (v <= 1) { clearInterval(testAiCooldownRef.current!); return 0 }
        return v - 1
      })
    }, 1000)
  }, [])

  const markDirty = () => setDirty(true)

  const save = useMutation({
    mutationFn: async () => {
      await Promise.all([
        saveSetting('ai.anthropicApiKey', apiKey),
        saveSetting('ai.baseUrl', baseUrl),
        saveSetting('ai.model', model),
        saveSetting('ai.timeoutSeconds', String(timeoutSeconds)),
        saveSetting('embedding.apiKey', embApiKey),
        saveSetting('embedding.baseUrl', embBaseUrl),
        saveSetting('embedding.model', embModel),
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

  const testAi = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/test-ai', { method: 'POST' }),
    onSuccess: (res) => {
      if (res.ok) notifications.show({ color: 'teal', title: 'Koneksi OK', message: res.message })
      else notifications.show({ color: 'red', title: 'Koneksi gagal', message: res.message })
      startCooldown()
    },
    onError: (e: Error) => { notifications.show({ color: 'red', title: 'Error', message: e.message }); startCooldown() },
  })

  const sendNow = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/send-now', { method: 'POST' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      if (res.ok) notifications.show({ color: 'teal', title: 'Terkirim!', message: res.message })
      else notifications.show({ color: 'red', title: 'Gagal', message: res.message })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

  const triggerCron = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>('/api/admin/report/cron-trigger', { method: 'POST' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'report-send-history'] })
      if (res.ok) notifications.show({ color: 'teal', title: 'Cron berhasil', message: res.message })
      else notifications.show({ color: 'red', title: 'Gagal', message: res.message })
    },
    onError: (e: Error) => notifications.show({ color: 'red', title: 'Error', message: e.message }),
  })

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

  const stream = useReportStream({
    onComplete: (full) => { setPreview(full); setEditedReport(full) },
  })

  const handleStartStream = useCallback(() => {
    setPreview(null)
    setEditedReport(null)
    stream.start()
  }, [stream])

  const apiKeySet = settings['ai.anthropicApiKey'] === '***'

  return (
    <Stack gap="lg">
      <div>
        <Title order={3}>AI & Laporan Harian</Title>
        <Text c="dimmed" size="sm">Konfigurasi Claude AI untuk laporan naratif harian yang cerdas.</Text>
      </div>

      <ClaudeApiCard
        apiKey={apiKey} onApiKeyChange={(v) => { setApiKey(v); markDirty() }}
        baseUrl={baseUrl} onBaseUrlChange={(v) => { setBaseUrl(v); markDirty() }}
        model={model} onModelChange={(v) => { setModel(v); markDirty() }}
        timeoutSeconds={timeoutSeconds} onTimeoutChange={(v) => { setTimeoutSeconds(v); markDirty() }}
        embApiKey={embApiKey} onEmbApiKeyChange={(v) => { setEmbApiKey(v); markDirty() }}
        embBaseUrl={embBaseUrl} onEmbBaseUrlChange={(v) => { setEmbBaseUrl(v); markDirty() }}
        embModel={embModel} onEmbModelChange={(v) => { setEmbModel(v); markDirty() }}
        dirty={dirty} onSave={() => save.mutate()} saving={save.isPending} isLoading={isLoading}
        onTest={() => testAi.mutate()} testing={testAi.isPending}
        testCooldown={testAiCooldown} apiKeySet={apiKeySet}
      />

      <ReportScheduleCard
        timezone={timezone} onTimezoneChange={(v) => { setTimezone(v); markDirty() }}
        scheduleTime={scheduleTime} onScheduleTimeChange={(v) => { setScheduleTime(v); markDirty() }}
        countdown={countdown} localTime={localTime}
        dirty={dirty} onSave={() => save.mutate()} saving={save.isPending} isLoading={isLoading}
        onTriggerCron={() => triggerCron.mutate()} triggeringCron={triggerCron.isPending}
      />

      <PromptInstructionCard
        promptInstruction={promptInstruction}
        onPromptChange={(v) => { setPromptInstruction(v); setPromptDirty(true) }}
        promptDirty={promptDirty}
        onSave={() => savePrompt.mutate()} saving={savePrompt.isPending}
      />

      <PreviewSendCard
        apiKeySet={apiKeySet} apiKey={apiKey} model={model}
        isStreaming={stream.isStreaming} streamPhase={stream.streamPhase}
        streamError={stream.streamError} elapsed={stream.elapsed} streamingText={stream.streamingText}
        rawPrompt={rawPrompt} preview={preview} editedReport={editedReport} onEditReport={setEditedReport}
        onStartStream={handleStartStream}
        onFetchPrompt={() => fetchPrompt.mutate()} fetchingPrompt={fetchPrompt.isPending}
        onSendNow={() => sendNow.mutate()} sendingNow={sendNow.isPending}
        onSendCustom={(text) => sendCustom.mutate({ text })} sendingCustom={sendCustom.isPending}
      />

      <ReportHistoryPanel showDelete={showDeleteHistory} />
      <SnapshotHistoryPanel />
    </Stack>
  )
}
