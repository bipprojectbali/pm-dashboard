import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  Menu,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbCheck, TbCopy, TbDots, TbKey, TbPlus, TbShieldOff, TbTrash } from 'react-icons/tb'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

type TokenScope = 'READ' | 'WRITE'
type TokenStatus = 'ACTIVE' | 'REVOKED'

interface TokenRow {
  id: string
  name: string
  tokenPrefix: string
  scope: TokenScope
  status: TokenStatus
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string; email: string } | null
}

interface CreateResponse {
  token: Omit<TokenRow, 'lastUsedAt' | 'createdBy'>
  raw: string
}

const STATUS_COLOR: Record<TokenStatus, string> = { ACTIVE: 'green', REVOKED: 'red' }
const SCOPE_COLOR: Record<TokenScope, string> = { READ: 'blue', WRITE: 'grape' }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'baru saja'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  return `${Math.floor(h / 24)}h lalu`
}

function formatExpiry(iso: string | null): string {
  if (!iso) return 'Tidak ada'
  const d = new Date(iso)
  return d.getTime() <= Date.now() ? `Kedaluwarsa` : d.toLocaleDateString()
}

export function AccessTokensCard({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['project-tokens', projectId],
    queryFn: () => api<{ tokens: TokenRow[] }>(`/api/projects/${projectId}/access-tokens`),
    enabled: canManage,
  })

  const createToken = useMutation({
    mutationFn: (body: { name: string; scope: TokenScope; expiresInDays?: number }) =>
      api<CreateResponse>(`/api/projects/${projectId}/access-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['project-tokens', projectId] })
      openShowOnceModal(res.raw, res.token.name)
      notifySuccess({ message: `Token "${res.token.name}" dibuat. Salin sekarang — hanya tampil sekali.` })
    },
    onError: (err) => notifyError(err),
  })

  const revokeToken = useMutation({
    mutationFn: (id: string) =>
      api(`/api/projects/${projectId}/access-tokens/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-tokens', projectId] })
      notifySuccess({ message: 'Token di-revoke.' })
    },
    onError: (err) => notifyError(err),
  })

  const deleteToken = useMutation({
    mutationFn: (id: string) => api(`/api/projects/${projectId}/access-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-tokens', projectId] })
      notifySuccess({ message: 'Token dihapus.' })
    },
    onError: (err) => notifyError(err),
  })

  const tokens = data?.tokens ?? []

  const openShowOnceModal = (raw: string, name: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const docsUrl = `${origin}/llms-agent.txt`
    const curlSnippet = `curl -H "Authorization: Bearer ${raw}" ${origin}/api/agent/tasks`
    modals.open({
      title: `Token dibuat: ${name}`,
      size: 'lg',
      children: (
        <Stack gap="sm">
          <Alert color="yellow" variant="light">
            Simpan token ini sekarang — setelah modal ditutup, token tidak bisa dilihat lagi.
          </Alert>
          <Card withBorder padding="sm" radius="sm">
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{raw}</Code>
              <CopyButton value={raw}>
                {({ copied, copy }) => (
                  <Button size="xs" leftSection={copied ? <TbCheck size={14} /> : <TbCopy size={14} />} onClick={copy}>
                    {copied ? 'Tersalin' : 'Salin'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Card>
          <Text size="xs" c="dimmed">
            Token untuk agent (Claude Code / CLI) mengakses project ini. Panduan endpoint (butuh token/login):
          </Text>
          <Card withBorder padding="sm" radius="sm">
            <Stack gap={6}>
              <Group gap="xs" wrap="nowrap">
                <Code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{docsUrl}</Code>
                <CopyButton value={docsUrl}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="light" leftSection={copied ? <TbCheck size={14} /> : <TbCopy size={14} />} onClick={copy}>
                      {copied ? 'Tersalin' : 'Salin'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
              <Group gap="xs" wrap="nowrap">
                <Code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{curlSnippet}</Code>
                <CopyButton value={curlSnippet}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="light" leftSection={copied ? <TbCheck size={14} /> : <TbCopy size={14} />} onClick={copy}>
                      {copied ? 'Tersalin' : 'Salin'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
          </Card>
          <Text size="xs" c="dimmed">
            Alternatif interaktif: MCP endpoint <Code>{origin}/mcp</Code> untuk Claude Code.
          </Text>
        </Stack>
      ),
    })
  }

  const openCreate = () => {
    let name = ''
    let scope: TokenScope = 'READ'
    let expiryPreset = 'never'
    modals.openConfirmModal({
      title: 'Buat access token',
      children: (
        <Stack gap="sm">
          <TextInput label="Nama" placeholder="mis. claude-code agent" onChange={(e) => (name = e.currentTarget.value)} />
          <Select
            label="Scope"
            defaultValue="READ"
            data={[
              { value: 'READ', label: 'READ — hanya baca' },
              { value: 'WRITE', label: 'WRITE — baca & update' },
            ]}
            onChange={(v) => (scope = (v as TokenScope) ?? 'READ')}
          />
          <Select
            label="Kedaluwarsa"
            defaultValue="never"
            data={[
              { value: 'never', label: 'Tidak ada' },
              { value: '7', label: '7 hari' },
              { value: '30', label: '30 hari' },
              { value: '90', label: '90 hari' },
              { value: '365', label: '1 tahun' },
            ]}
            onChange={(v) => (expiryPreset = v ?? 'never')}
          />
        </Stack>
      ),
      labels: { confirm: 'Buat', cancel: 'Batal' },
      confirmProps: { color: 'green' },
      onConfirm: () => {
        if (!name.trim()) return
        createToken.mutate({
          name: name.trim(),
          scope,
          expiresInDays: expiryPreset === 'never' ? undefined : Number(expiryPreset),
        })
      },
    })
  }

  const confirmRevoke = (t: TokenRow) =>
    modals.openConfirmModal({
      title: 'Revoke token',
      children: <Text size="sm">Token "{t.name}" tidak bisa dipakai lagi setelah di-revoke. Lanjutkan?</Text>,
      labels: { confirm: 'Revoke', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => revokeToken.mutate(t.id),
    })

  const confirmDelete = (t: TokenRow) =>
    modals.openConfirmModal({
      title: 'Hapus token',
      children: <Text size="sm">Hapus token "{t.name}" permanen dari daftar?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteToken.mutate(t.id),
    })

  if (!canManage) return null

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <TbKey size={18} />
          <Text fw={600} size="sm">
            Access Tokens
          </Text>
        </Group>
        <Button size="xs" leftSection={<TbPlus size={14} />} onClick={openCreate} loading={createToken.isPending}>
          Buat Token
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Token per-project untuk agent coding (mis. Claude Code) agar bisa membaca/memperbarui task, bug, dan tiket
        project ini. WRITE = boleh update; READ = hanya baca.
      </Text>
      {tokens.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          Belum ada token.
        </Text>
      ) : (
        <Table striped highlightOnHover verticalSpacing="xs" fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nama</Table.Th>
              <Table.Th>Prefix</Table.Th>
              <Table.Th>Scope</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Dipakai</Table.Th>
              <Table.Th>Kedaluwarsa</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tokens.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{t.name}</Table.Td>
                <Table.Td>
                  <Code>{t.tokenPrefix}…</Code>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" color={SCOPE_COLOR[t.scope]} variant="light">
                    {t.scope}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" color={STATUS_COLOR[t.status]} variant="light">
                    {t.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatRelative(t.lastUsedAt)}</Table.Td>
                <Table.Td>{formatExpiry(t.expiresAt)}</Table.Td>
                <Table.Td>
                  <Menu shadow="md" position="bottom-end">
                    <Menu.Target>
                      <ActionIcon variant="subtle" size="sm">
                        <TbDots size={14} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {t.status === 'ACTIVE' && (
                        <Menu.Item leftSection={<TbShieldOff size={14} />} color="red" onClick={() => confirmRevoke(t)}>
                          Revoke
                        </Menu.Item>
                      )}
                      <Menu.Item leftSection={<TbTrash size={14} />} color="red" onClick={() => confirmDelete(t)}>
                        Hapus
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  )
}
