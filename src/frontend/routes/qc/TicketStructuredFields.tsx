import { Group, Textarea, TextInput, Tooltip } from '@mantine/core'
import { TbHelpCircle } from 'react-icons/tb'

export interface StructuredFields {
  stepsToReproduce: string
  expected: string
  actual: string
  environment: string
  browser: string
  appVersion: string
}

export const EMPTY_STRUCTURED: StructuredFields = {
  stepsToReproduce: '',
  expected: '',
  actual: '',
  environment: '',
  browser: '',
  appVersion: '',
}

const helpIcon = (label: string) => (
  <Tooltip label={label} multiline w={240} withArrow>
    <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 4, color: 'var(--mantine-color-dimmed)' }}>
      <TbHelpCircle size={14} />
    </span>
  </Tooltip>
)

export function TicketStructuredFields({
  fields,
  onChange,
}: {
  fields: StructuredFields
  onChange: (patch: Partial<StructuredFields>) => void
}) {
  return (
    <>
      <Textarea
        label="Langkah reproduksi"
        description="Urutan langkah agar bug muncul kembali. Makin spesifik makin cepat diperbaiki."
        placeholder={'1. Buka /admin?tab=users\n2. Klik tombol Block\n3. Refresh halaman'}
        value={fields.stepsToReproduce}
        onChange={(e) => onChange({ stepsToReproduce: e.currentTarget.value })}
        minRows={3}
        autosize
        required
      />
      <Textarea
        label="Hasil yang diharapkan"
        description="Apa yang seharusnya terjadi."
        placeholder="User langsung ter-block dan baris berubah jadi abu-abu."
        value={fields.expected}
        onChange={(e) => onChange({ expected: e.currentTarget.value })}
        minRows={2}
        autosize
        required
      />
      <Textarea
        label="Hasil aktual"
        description="Apa yang sebenarnya terjadi (pesan error, layar blank, dll)."
        placeholder="Halaman blank putih, console error 'Cannot read properties of undefined'."
        value={fields.actual}
        onChange={(e) => onChange({ actual: e.currentTarget.value })}
        minRows={2}
        autosize
        required
      />
      <Group grow>
        <TextInput
          label={<>Environment {helpIcon('Lingkungan tempat bug ditemui — production, staging, atau lokal. Terisi otomatis dari server.')}</>}
          placeholder="production"
          value={fields.environment}
          onChange={(e) => onChange({ environment: e.currentTarget.value })}
        />
        <TextInput
          label={<>Browser {helpIcon('Browser dan versinya, mis. "Chrome 120" atau "Safari 17". Kosongkan jika tidak relevan.')}</>}
          placeholder="Chrome 120"
          value={fields.browser}
          onChange={(e) => onChange({ browser: e.currentTarget.value })}
        />
      </Group>
      <TextInput
        label={<>Versi pm-dashboard {helpIcon('Versi aplikasi saat bug terjadi. Terisi otomatis dari /api/version.')}</>}
        placeholder="0.0.0"
        value={fields.appVersion}
        onChange={(e) => onChange({ appVersion: e.currentTarget.value })}
        readOnly
        variant="filled"
      />
    </>
  )
}
