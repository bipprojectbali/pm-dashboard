import { Button, Card, Divider, Group, Stack, Text } from '@mantine/core'
import { TimePicker } from '@mantine/dates'
import { Select } from '@mantine/core'
import { TbCheck, TbPlayerPlay } from 'react-icons/tb'
import { TIMEZONE_OPTIONS, tzShortLabel } from './constants'

export function ReportScheduleCard({
  timezone, onTimezoneChange,
  scheduleTime, onScheduleTimeChange,
  countdown, localTime,
  dirty, onSave, saving, isLoading,
  onTriggerCron, triggeringCron,
}: {
  timezone: string; onTimezoneChange: (v: string) => void
  scheduleTime: string; onScheduleTimeChange: (v: string) => void
  countdown: string; localTime: string
  dirty: boolean; onSave: () => void; saving: boolean; isLoading: boolean
  onTriggerCron: () => void; triggeringCron: boolean
}) {
  return (
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
          onChange={(v) => { if (v) onTimezoneChange(v) }}
          allowDeselect={false}
        />
        <TimePicker
          label={`Jam kirim laporan (${tzShortLabel(timezone)})`}
          description={`Laporan dikirim setiap hari pada waktu ini menurut ${timezone}.`}
          value={scheduleTime}
          onChange={onScheduleTimeChange}
        />

        {countdown && (
          <Group
            gap="xs" p="sm"
            style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 'var(--mantine-radius-sm)' }}
          >
            <Stack gap={2} style={{ flex: 1 }}>
              <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.5 }}>
                Waktu sekarang ({tzShortLabel(timezone)})
              </Text>
              <Text size="sm" fw={600} ff="monospace">{localTime}</Text>
            </Stack>
            <Stack gap={2} style={{ flex: 1 }}>
              <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.5 }}>
                Kirim berikutnya dalam
              </Text>
              <Text size="sm" fw={700} ff="monospace" c="blue">{countdown}</Text>
            </Stack>
          </Group>
        )}

        <Group justify="space-between">
          <Button
            variant="light" color="teal" size="xs" leftSection={<TbPlayerPlay size={13} />}
            onClick={onTriggerCron} loading={triggeringCron}
          >
            Simulasi Cron
          </Button>
          <Button leftSection={<TbCheck size={14} />} onClick={onSave} loading={saving || isLoading} disabled={!dirty}>
            Simpan
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
