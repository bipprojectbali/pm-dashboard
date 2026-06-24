import {
  Alert,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core'
import { TbCheck, TbPlugConnected, TbRobot } from 'react-icons/tb'
import { MODEL_OPTIONS } from './constants'

export function ClaudeApiCard({
  apiKey, onApiKeyChange,
  baseUrl, onBaseUrlChange,
  model, onModelChange,
  timeoutSeconds, onTimeoutChange,
  embApiKey, onEmbApiKeyChange,
  embBaseUrl, onEmbBaseUrlChange,
  embModel, onEmbModelChange,
  dirty, onSave, saving, isLoading,
  onTest, testing, testCooldown, apiKeySet,
}: {
  apiKey: string; onApiKeyChange: (v: string) => void
  baseUrl: string; onBaseUrlChange: (v: string) => void
  model: string; onModelChange: (v: string) => void
  timeoutSeconds: number; onTimeoutChange: (v: number) => void
  embApiKey: string; onEmbApiKeyChange: (v: string) => void
  embBaseUrl: string; onEmbBaseUrlChange: (v: string) => void
  embModel: string; onEmbModelChange: (v: string) => void
  dirty: boolean; onSave: () => void; saving: boolean; isLoading: boolean
  onTest: () => void; testing: boolean; testCooldown: number; apiKeySet: boolean
}) {
  return (
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
          onChange={(e) => onApiKeyChange(e.currentTarget.value)}
        />
        <TextInput
          label="Base URL (opsional)"
          placeholder="https://your-proxy.example.com"
          description="Kosongkan untuk pakai endpoint Anthropic langsung. Isi jika menggunakan proxy/gateway custom. Harus kompatibel dengan Anthropic API (/v1/messages)."
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.currentTarget.value)}
        />
        <Select
          label="Model Claude"
          description="Opus paling cerdas, Haiku paling hemat biaya."
          data={MODEL_OPTIONS}
          value={model}
          onChange={(v) => { if (v) onModelChange(v) }}
        />
        <NumberInput
          label="Timeout Claude API (detik)"
          description="Batas waktu tunggu response dari Claude. Naikkan jika sering timeout saat generate laporan panjang."
          value={timeoutSeconds}
          onChange={(v) => onTimeoutChange(Number(v) || 120)}
          min={30} max={600} step={30} suffix=" detik" w={220}
        />

        <Divider label="Embedding untuk Chat AI Knowledge Base (opsional)" labelPosition="center" my="xs" />
        <Alert color="blue" variant="light" title="Semantic Search (pgvector)" icon={<TbRobot size={14} />}>
          Jika dikonfigurasi, Chat AI akan menggunakan vector similarity search yang memahami makna semantik — bukan
          hanya keyword matching. Gunakan API OpenAI-compatible seperti OpenRouter. Kosongkan untuk tetap pakai
          full-text search bawaan.
        </Alert>

        <PasswordInput
          label="Embedding API Key"
          placeholder="sk-or-... atau sk-..."
          description="API key untuk embedding model. Bisa pakai OpenRouter (openrouter.ai/keys) atau OpenAI."
          value={embApiKey}
          onChange={(e) => onEmbApiKeyChange(e.currentTarget.value)}
        />
        <TextInput
          label="Embedding Base URL"
          placeholder="https://openrouter.ai/api/v1"
          description="Default: https://openrouter.ai/api/v1. Bisa diubah ke OpenAI atau provider lain yang kompatibel."
          value={embBaseUrl}
          onChange={(e) => onEmbBaseUrlChange(e.currentTarget.value)}
        />
        <TextInput
          label="Embedding Model"
          placeholder="openai/text-embedding-3-small"
          description="Model harus menghasilkan 1536 dimensi. Contoh: openai/text-embedding-3-small (OpenRouter), text-embedding-3-small (OpenAI)."
          value={embModel}
          onChange={(e) => onEmbModelChange(e.currentTarget.value)}
        />

        <Group justify="space-between">
          <Button
            variant="light" color="violet" leftSection={<TbPlugConnected size={14} />}
            onClick={onTest} loading={testing}
            disabled={(!apiKeySet && !apiKey) || testCooldown > 0}
          >
            {testCooldown > 0 ? `Test Koneksi AI (${testCooldown}s)` : 'Test Koneksi AI'}
          </Button>
          <Button leftSection={<TbCheck size={14} />} onClick={onSave} loading={saving || isLoading} disabled={!dirty}>
            Simpan
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
