import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Kbd,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useHotkeys } from '@mantine/hooks'
import { useState } from 'react'
import { TbAlertTriangle, TbCalendarEvent, TbClock, TbPlus, TbTarget } from 'react-icons/tb'
import {
  PRIORITY_COLOR,
  PRIORITY_OPTIONS,
  STATUS_COLOR,
  STATUS_OPTIONS,
  type ProjectPriority,
  type ProjectStatus,
} from './types'
import { PillButton, SectionLabel } from './CreateProjectModal/shared'

export function CreateProjectModal({
  opened,
  onClose,
  onSubmit,
  onReset,
  loading,
  error,
}: {
  opened: boolean
  onClose: () => void
  onSubmit: (body: {
    name: string
    description?: string
    status?: ProjectStatus
    priority?: ProjectPriority
    startsAt?: string | null
    endsAt?: string | null
  }) => void
  onReset: () => void
  loading: boolean
  error?: string
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE')
  const [priority, setPriority] = useState<ProjectPriority>('MEDIUM')
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [endsAt, setEndsAt] = useState<Date | null>(null)

  const reset = () => {
    setName('')
    setDescription('')
    setStatus('ACTIVE')
    setPriority('MEDIUM')
    setStartsAt(null)
    setEndsAt(null)
  }

  const invalidRange = startsAt && endsAt && endsAt < startsAt
  const canSubmit = !!name.trim() && !invalidRange && !loading

  const durationDays =
    startsAt && endsAt && !invalidRange
      ? Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000))
      : null
  const durationLabel = durationDays
    ? durationDays >= 30
      ? `~${Math.round(durationDays / 30)} bulan`
      : durationDays >= 7
        ? `~${Math.round(durationDays / 7)} minggu`
        : `${durationDays} hari`
    : null

  const applyDurationPreset = (days: number) => {
    const start = startsAt ?? new Date()
    if (!startsAt) setStartsAt(start)
    const end = new Date(start)
    end.setDate(end.getDate() + days)
    setEndsAt(end)
  }

  const submit = () => {
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      startsAt: startsAt ? startsAt.toISOString() : null,
      endsAt: endsAt ? endsAt.toISOString() : null,
    })
  }

  useHotkeys(opened ? [['mod+Enter', submit]] : [])

  const descLimit = 280
  const descLen = description.length

  return (
    <Modal
      opened={opened}
      onClose={() => {
        reset()
        onClose()
      }}
      title={
        <Group gap="sm">
          <ThemeIcon variant="light" color="blue" size="lg" radius="md">
            <TbTarget size={18} />
          </ThemeIcon>
          <div>
            <Text fw={600} size="sm">
              Proyek Baru
            </Text>
            <Text size="xs" c="dimmed">
              Buat ruang kerja baru untuk tim kamu
            </Text>
          </div>
        </Group>
      }
      size="lg"
      centered
      overlayProps={{ blur: 3, opacity: 0.55 }}
      radius="md"
    >
      <Stack gap="lg">
        <Stack gap="xs">
          <SectionLabel>Info Dasar</SectionLabel>
          <TextInput
            label="Nama proyek"
            placeholder="mis. Redesign Website Acme"
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value)
              if (error) onReset()
            }}
            required
            data-autofocus
            size="md"
            error={error?.includes('sudah ada') ? error : undefined}
          />
          <Textarea
            label="Deskripsi"
            placeholder="Tujuan utama, deliverable, atau konteks singkat"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value.slice(0, descLimit))}
            autosize
            minRows={2}
            maxRows={5}
            description={
              <Group gap={6} justify="flex-end">
                <Text size="xs" c={descLen > descLimit - 40 ? 'orange' : 'dimmed'}>
                  {descLen}/{descLimit}
                </Text>
              </Group>
            }
          />
        </Stack>

        <Stack gap="xs">
          <SectionLabel>Klasifikasi</SectionLabel>
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={500}>
              Status
            </Text>
            <Group gap={6} wrap="wrap">
              {STATUS_OPTIONS.map((o) => (
                <PillButton
                  key={o.value}
                  active={status === o.value}
                  color={STATUS_COLOR[o.value]}
                  onClick={() => setStatus(o.value)}
                >
                  {o.label}
                </PillButton>
              ))}
            </Group>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={500}>
              Prioritas
            </Text>
            <Group gap={6} wrap="wrap">
              {PRIORITY_OPTIONS.map((o) => (
                <PillButton
                  key={o.value}
                  active={priority === o.value}
                  color={PRIORITY_COLOR[o.value]}
                  onClick={() => setPriority(o.value)}
                >
                  {o.label}
                </PillButton>
              ))}
            </Group>
          </Stack>
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between" align="flex-end">
            <SectionLabel>Timeline</SectionLabel>
            {durationLabel && (
              <Badge variant="light" color="blue" leftSection={<TbClock size={10} />} size="sm">
                {durationLabel}
              </Badge>
            )}
          </Group>
          <Group grow>
            <DateInput
              highlightToday
              label="Mulai"
              placeholder="Opsional"
              value={startsAt}
              onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
              clearable
              leftSection={<TbClock size={14} />}
            />
            <DateInput
              highlightToday
              label="Selesai"
              placeholder="Opsional"
              value={endsAt}
              onChange={(v) => setEndsAt(v ? new Date(v as unknown as string) : null)}
              clearable
              leftSection={<TbCalendarEvent size={14} />}
              error={invalidRange ? 'Tanggal selesai harus setelah mulai' : undefined}
              minDate={startsAt ?? undefined}
            />
          </Group>
          <Group gap={6} wrap="wrap">
            <Text size="xs" c="dimmed">
              Cepat:
            </Text>
            {[
              { label: '1 minggu', days: 7 },
              { label: '2 minggu', days: 14 },
              { label: '1 bulan', days: 30 },
              { label: '3 bulan', days: 90 },
            ].map((p) => (
              <UnstyledButton
                key={p.days}
                onClick={() => applyDurationPreset(p.days)}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--mantine-color-default-border)',
                  color: 'var(--mantine-color-dimmed)',
                }}
              >
                {p.label}
              </UnstyledButton>
            ))}
          </Group>
        </Stack>

        {error && !error.includes('sudah ada') && (
          <Alert color="red" variant="light" icon={<TbAlertTriangle size={16} />} radius="md">
            {error}
          </Alert>
        )}

        <Divider />

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Tekan <Kbd>⌘</Kbd> + <Kbd>Enter</Kbd> untuk menyimpan
          </Text>
          <Group gap="xs">
            <Button
              variant="subtle"
              onClick={() => {
                reset()
                onClose()
              }}
            >
              Batal
            </Button>
            <Button onClick={submit} disabled={!canSubmit} loading={loading} leftSection={<TbPlus size={16} />}>
              Buat Proyek
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
