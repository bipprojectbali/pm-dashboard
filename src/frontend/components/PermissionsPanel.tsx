import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  MultiSelect,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbAlertTriangle, TbRefresh } from 'react-icons/tb'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

type PermRuleType = 'systemRoles' | 'projectRoles' | 'minProjectRole'

interface PermRule {
  key: string
  label: string
  description: string
  type: PermRuleType
  options: string[]
  default: string[]
  current: string[]
  isDefault: boolean
}

interface PermRulesResponse {
  rules: PermRule[]
}

async function fetchRules(): Promise<PermRulesResponse> {
  const res = await fetch('/api/admin/permission-rules', { credentials: 'include' })
  if (!res.ok) throw new Error(`Gagal memuat permission rules (${res.status})`)
  return res.json()
}

async function updateRule(key: string, value: string[]): Promise<void> {
  const res = await fetch(`/api/admin/permission-rules/${encodeURIComponent(key)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Gagal update (${res.status})`)
  }
}

function RuleCard({ rule, onUpdate }: { rule: PermRule; onUpdate: (key: string, value: string[]) => void }) {
  const isMulti = rule.type !== 'minProjectRole'

  const handleReset = () => onUpdate(rule.key, rule.default)

  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Group gap="xs" align="center">
              <Text fw={600} size="sm">
                {rule.label}
              </Text>
              {rule.isDefault && (
                <Badge size="xs" variant="light" color="gray">
                  default
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {rule.description}
            </Text>
          </Stack>
          {!rule.isDefault && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<TbRefresh size={13} />}
              onClick={handleReset}
            >
              Reset
            </Button>
          )}
        </Group>

        {isMulti ? (
          <MultiSelect
            size="sm"
            data={rule.options}
            value={rule.current}
            onChange={(val) => {
              if (val.length > 0) onUpdate(rule.key, val)
            }}
            clearable={false}
          />
        ) : (
          <Select
            size="sm"
            data={rule.options}
            value={rule.current[0] ?? null}
            onChange={(val) => {
              if (val) onUpdate(rule.key, [val])
            }}
            clearable={false}
          />
        )}

        <Text size="xs" c="dimmed">
          Nilai saat ini:{' '}
          <Text span c="blue.6" size="xs">
            {rule.current.join(', ')}
          </Text>
          {' · '}Default:{' '}
          <Text span size="xs">
            {rule.default.join(', ')}
          </Text>
        </Text>
      </Stack>
    </Card>
  )
}

export function PermissionsPanel() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'permission-rules'],
    queryFn: fetchRules,
    staleTime: 60_000,
  })

  const mut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string[] }) => updateRule(key, value),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'permission-rules'] })
      notifySuccess(`Aturan "${vars.key}" berhasil diperbarui`)
    },
    onError: (e) => notifyError(e instanceof Error ? e.message : String(e)),
  })

  const handleUpdate = (key: string, value: string[]) => mut.mutate({ key, value })

  if (isLoading) {
    return (
      <Card withBorder>
        <Group justify="center" py="lg">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Memuat aturan izin...
          </Text>
        </Group>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert color="red" icon={<TbAlertTriangle size={16} />} title="Gagal memuat">
        {error instanceof Error ? error.message : 'Error tidak diketahui'}
      </Alert>
    )
  }

  const rules = data?.rules ?? []

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={4}>Aturan Izin (Permission Config)</Title>
        <Text size="sm" c="dimmed">
          Konfigurasi runtime aturan akses role. SUPER_ADMIN selalu bisa (tidak dapat dikunci). Perubahan efektif
          dalam 60 detik.
        </Text>
      </Stack>

      <Stack gap="sm">
        {rules.map((rule) => (
          <RuleCard key={rule.key} rule={rule} onUpdate={handleUpdate} />
        ))}
      </Stack>
    </Stack>
  )
}
