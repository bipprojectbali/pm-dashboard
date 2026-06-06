import { Alert, Badge, Card, Group, Loader, Stack, Switch, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbAlertTriangle, TbCircleCheck } from 'react-icons/tb'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

type ExtensionKey = 'github' | 'chat'

interface ExtensionRow {
  key: ExtensionKey
  label: string
  description: string
  enabled: boolean
}

interface ExtensionsResponse {
  extensions: ExtensionRow[]
}

async function fetchExtensions(): Promise<ExtensionsResponse> {
  const res = await fetch('/api/admin/extensions', { credentials: 'include' })
  if (!res.ok) throw new Error(`Gagal memuat extension (${res.status})`)
  return res.json()
}

async function toggleExtension(key: ExtensionKey, enabled: boolean) {
  const res = await fetch(`/api/admin/extensions/${key}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Toggle gagal (${res.status})`)
  }
  return res.json()
}

export function ExtensionTogglePanel({ only }: { only: ExtensionKey }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'extensions'],
    queryFn: fetchExtensions,
    staleTime: 30_000,
  })

  const mut = useMutation({
    mutationFn: (params: { key: ExtensionKey; enabled: boolean }) => toggleExtension(params.key, params.enabled),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'extensions'] })
      qc.invalidateQueries({ queryKey: ['extensions', 'status'] })
      notifySuccess(`Extension ${vars.key} → ${vars.enabled ? 'aktif' : 'nonaktif'}`)
    },
    onError: (e) => notifyError(e instanceof Error ? e.message : String(e)),
  })

  if (isLoading) {
    return (
      <Card withBorder>
        <Group justify="center" py="lg">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Memuat status extension…
          </Text>
        </Group>
      </Card>
    )
  }
  if (error) {
    return (
      <Alert color="red" icon={<TbAlertTriangle />}>
        {error instanceof Error ? error.message : String(error)}
      </Alert>
    )
  }

  const row = data?.extensions.find((e) => e.key === only)
  if (!row) {
    return <Alert color="red">Extension {only} tidak ditemukan.</Alert>
  }

  return (
    <Stack gap="md">
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Group gap="xs">
                <Text fw={600}>{row.label}</Text>
                <Badge
                  color={row.enabled ? 'teal' : 'gray'}
                  variant={row.enabled ? 'filled' : 'light'}
                  leftSection={row.enabled ? <TbCircleCheck size={12} /> : null}
                >
                  {row.enabled ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" maw={620}>
                {row.description}
              </Text>
            </Stack>
            <Switch
              size="lg"
              checked={row.enabled}
              disabled={mut.isPending}
              onChange={(e) => mut.mutate({ key: row.key, enabled: e.currentTarget.checked })}
              onLabel="ON"
              offLabel="OFF"
            />
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Apa yang berubah saat di-toggle?
          </Text>
          {only === 'github' ? <GithubExplain /> : <ChatExplain />}
        </Stack>
      </Card>
    </Stack>
  )
}

function GithubExplain() {
  return (
    <Stack gap={4}>
      <Text size="sm">
        • <b>OFF</b>: webhook <code>/webhooks/github</code> tetap menerima request tapi membalas{' '}
        <code>200 ok-but-skipped</code> (mencegah GitHub auto-disable webhook setelah 100 kegagalan beruntun).
      </Text>
      <Text size="sm">
        • Doc <code>github_project</code> tidak di-refresh di sync; tool <code>query_github_activity</code>{' '}
        otomatis disembunyikan dari Chat AI.
      </Text>
      <Text size="sm">
        • UI <i>GithubIntegrationCard</i> (tab Settings) dan <i>GithubActivityCard</i> (tab Overview) di project
        detail disembunyikan.
      </Text>
      <Text size="sm" c="dimmed">
        Data lama (event, PR, commit) tidak dihapus — toggle hanya membekukan ingest & tampilan.
      </Text>
    </Stack>
  )
}

function ChatExplain() {
  return (
    <Stack gap={4}>
      <Text size="sm">
        • <b>OFF</b>: endpoint <code>/api/admin/chat/stream</code> &amp; <code>/api/admin/chat/sync</code>{' '}
        balas <code>503</code>. Tab Chat AI di /admin disembunyikan.
      </Text>
      <Text size="sm">
        • Startup full-sync &amp; cron <code>*/10m</code> incremental sync di-skip — embedding API &amp; Anthropic
        call tidak akan dipanggil.
      </Text>
      <Text size="sm" c="dimmed">
        Tabel <code>chat_document</code> tidak di-drop — hidupkan kembali untuk lanjutkan dari snapshot terakhir
        (mungkin perlu klik &quot;Perbarui Pengetahuan&quot; agar fresh).
      </Text>
    </Stack>
  )
}
