import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCloudDownload, TbCode, TbCopy, TbKey, TbShieldCheck } from 'react-icons/tb'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

const ENTITY_OPTIONS = [
  { key: 'users', label: 'Users', description: 'Semua user + role. Password tidak di-sync.' },
  { key: 'projects', label: 'Projects + Members', description: 'Project, anggota, dan deadline extensions.' },
  {
    key: 'tasks',
    label: 'Tasks + Sub-data',
    description: 'Task, checklist, komentar, evidence, status changes, dependencies.',
  },
  { key: 'tags', label: 'Tags', description: 'Tag per project.' },
  { key: 'milestones', label: 'Milestones', description: 'Milestone per project.' },
] as const

type EntityKey = (typeof ENTITY_OPTIONS)[number]['key']

const LS_URL = 'dev:sync:url'
const LS_ENTITIES = 'dev:sync:entities'
const DEFAULT_ENTITIES: EntityKey[] = ['users', 'projects', 'tasks', 'tags', 'milestones']

export function SyncPanel() {
  const [url, setUrl] = useState<string>(() => localStorage.getItem(LS_URL) ?? 'https://pm-dashboard.wibudev.com')
  const [token, setToken] = useState('')
  const [entities, setEntities] = useState<EntityKey[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_ENTITIES) ?? '')
      return Array.isArray(saved) ? saved : DEFAULT_ENTITIES
    } catch {
      return DEFAULT_ENTITIES
    }
  })
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [generatedToken, setGeneratedToken] = useState('')

  const persistUrl = (v: string) => {
    setUrl(v)
    localStorage.setItem(LS_URL, v)
  }
  const persistEntities = (v: EntityKey[]) => {
    setEntities(v)
    localStorage.setItem(LS_ENTITIES, JSON.stringify(v))
  }

  const toggleEntity = (key: EntityKey) => {
    persistEntities(entities.includes(key) ? entities.filter((e) => e !== key) : [...entities, key])
  }

  const pull = useMutation({
    mutationFn: () =>
      fetch('/api/admin/sync/pull', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), token: token.trim(), entities }),
      }).then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${r.status}`)
        return json as { ok: boolean; summary: Record<string, number> }
      }),
    onSuccess: (data) => {
      setSummary(data.summary)
      notifySuccess({ title: 'Sync berhasil', message: `Data dari ${url} berhasil di-pull ke local.` })
    },
    onError: (err) => notifyError(err),
  })

  const confirmPull = () => {
    if (!url.trim() || !token.trim()) {
      notifyError(new Error('URL dan token wajib diisi'))
      return
    }
    modals.openConfirmModal({
      title: 'Konfirmasi Pull Data',
      children: (
        <Stack gap="xs">
          <Alert color="red" variant="light">
            Data local akan <strong>dihapus</strong> dan diganti dengan data dari remote.
            {entities.includes('users') && <> Password user tidak di-sync — login via Google atau reset password.</>}
          </Alert>
          <Text size="sm">
            <strong>Dari:</strong> {url}
          </Text>
          <Text size="sm">
            <strong>Entities:</strong> {entities.join(', ')}
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Ya, Pull Sekarang', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => pull.mutate(),
    })
  }

  const generateToken = () => {
    const t = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    setGeneratedToken(t)
    navigator.clipboard.writeText(t).catch(() => {})
  }

  return (
    <Stack gap="lg" maw={640}>
      <Card withBorder>
        <Stack gap="md">
          <Text fw={600} size="sm">
            Sumber Remote
          </Text>

          <Group gap="xs" align="flex-end">
            <TextInput
              label="URL"
              placeholder="https://pm-dashboard.wibudev.com"
              value={url}
              onChange={(e) => persistUrl(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <ActionIcon variant="default" size="lg" component="a" href={url} target="_blank" title="Buka URL">
              <TbCode size={16} />
            </ActionIcon>
          </Group>

          <PasswordInput
            label="Bearer Token (MCP_SECRET di remote)"
            placeholder="Token tidak disimpan — ketik ulang setelah refresh"
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
          />

          <Box>
            <Text size="xs" c="dimmed" mb={4}>
              Generate token baru (untuk diset sebagai MCP_SECRET di remote)
            </Text>
            <Group gap="xs" align="center">
              <Button size="xs" variant="light" leftSection={<TbKey size={14} />} onClick={generateToken}>
                Generate Token
              </Button>
              {generatedToken && (
                <>
                  <Text size="xs" ff="monospace" c="blue" style={{ wordBreak: 'break-all', maxWidth: 300 }}>
                    {generatedToken}
                  </Text>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    title="Copy"
                    onClick={() => navigator.clipboard.writeText(generatedToken).catch(() => {})}
                  >
                    <TbCopy size={14} />
                  </ActionIcon>
                </>
              )}
            </Group>
          </Box>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Entities yang di-sync
          </Text>
          {ENTITY_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.key}
              checked={entities.includes(opt.key)}
              onChange={() => toggleEntity(opt.key)}
              label={
                <Box>
                  <Text size="sm">{opt.label}</Text>
                  <Text size="xs" c="dimmed">
                    {opt.description}
                  </Text>
                </Box>
              }
            />
          ))}
        </Stack>
      </Card>

      <Alert color="orange" variant="light" icon={<TbShieldCheck size={16} />}>
        <Text size="sm">
          <strong>Peringatan:</strong> Data local akan dihapus dan diganti sepenuhnya.
          {entities.includes('users') &&
            ' Password user tidak di-sync — gunakan Google login atau reset password manual.'}
        </Text>
      </Alert>

      <Group>
        <Button
          leftSection={<TbCloudDownload size={16} />}
          loading={pull.isPending}
          onClick={confirmPull}
          disabled={!url.trim() || !token.trim() || entities.length === 0}
        >
          Pull dari Remote
        </Button>
        {pull.isError && (
          <Text size="sm" c="red">
            {(pull.error as Error).message}
          </Text>
        )}
      </Group>

      {summary && (
        <Card withBorder>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Hasil Sync
              </Text>
              <Badge color="green" variant="light">
                Berhasil
              </Badge>
            </Group>
            <Divider />
            <SimpleGrid cols={3} spacing="xs">
              {Object.entries(summary).map(([key, count]) => (
                <Box
                  key={key}
                  p="xs"
                  style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6 }}
                >
                  <Text size="xs" c="dimmed" tt="capitalize">
                    {key}
                  </Text>
                  <Text fw={700} size="lg">
                    {count}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
