import {
  ActionIcon,
  Badge,
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { TbActivity, TbClock, TbDevices, TbRefresh, TbSearch, TbWifi } from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { SessionStatCard } from './sessionspanel/SessionStatCard'
import { SessionsTable } from './sessionspanel/SessionsTable'
import { PAGE_SIZE, ROLE_COLOR } from './sessionspanel/types'
import type { SessionsResponse, StatusFilter } from './sessionspanel/types'

export function SessionsPanel() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () =>
      fetch('/api/admin/sessions', { credentials: 'include' }).then((r) => r.json()) as Promise<SessionsResponse>,
    refetchInterval: 15_000,
  })

  const sessions = data?.sessions ?? []
  const summary = data?.summary

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sessions.filter((s) => {
      if (statusFilter === 'active' && s.isExpired) return false
      if (statusFilter === 'online' && !s.isOnline) return false
      if (statusFilter === 'expired' && !s.isExpired) return false
      if (roleFilter && s.userRole !== roleFilter) return false
      if (q) {
        const hay = `${s.userName} ${s.userEmail}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [sessions, statusFilter, roleFilter, search])

  const roleOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) set.add(s.userRole)
    return Array.from(set).sort()
  }, [sessions])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedFiltered = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, roleFilter])

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Group gap="xs">
            <Title order={3}>Active Sessions</Title>
            <InfoTip
              width={360}
              label="Login session dari tabel Session. Satu user bisa punya banyak session (mis. browser + hape). Session auto-expired sesuai expiresAt; user harus login ulang. Polling 15 detik."
            />
          </Group>
          <Text size="sm" c="dimmed">
            Login sessions aktif lintas user. Auto-refresh 15 detik.
          </Text>
        </div>
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" onClick={() => refetch()} loading={isFetching}>
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <SessionStatCard
          label="Total Sessions"
          value={summary?.totalSessions ?? 0}
          icon={TbDevices}
          color="blue"
          tip="Jumlah seluruh row Session di DB (active + expired yang belum di-cleanup)."
        />
        <SessionStatCard
          label="Active"
          value={summary?.activeSessions ?? 0}
          icon={TbActivity}
          color="teal"
          tip="Session dengan expiresAt > sekarang. User masih logged-in — bisa refresh page tanpa login ulang."
        />
        <SessionStatCard
          label="Online Users"
          value={summary?.onlineUsers ?? 0}
          icon={TbWifi}
          color="green"
          tip="User unik yang sedang terhubung via WebSocket /ws/presence. Real-time indicator — lagi aktif buka app."
        />
        <SessionStatCard
          label="Expired"
          value={summary?.expiredSessions ?? 0}
          icon={TbClock}
          color="gray"
          tip="Session dengan expiresAt ≤ sekarang. User perlu login ulang. Row akan dihapus otomatis saat user coba pakai sessionnya."
        />
      </SimpleGrid>

      <Card withBorder padding="sm" radius="md">
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Cari nama atau email"
            leftSection={<TbSearch size={12} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="xs"
            w={260}
          />
          <Tooltip
            multiline
            w={300}
            withArrow
            label="Active = belum expired. Online = terkoneksi WebSocket (subset Active). Expired = sudah lewat expiresAt."
          >
            <SegmentedControl
              size="xs"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              data={[
                { label: 'All', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Online', value: 'online' },
                { label: 'Expired', value: 'expired' },
              ]}
            />
          </Tooltip>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Role:
            </Text>
            <Badge
              variant={roleFilter === null ? 'filled' : 'light'}
              color="gray"
              size="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => setRoleFilter(null)}
            >
              All
            </Badge>
            {roleOptions.map((r) => (
              <Badge
                key={r}
                variant={roleFilter === r ? 'filled' : 'light'}
                color={ROLE_COLOR[r] ?? 'gray'}
                size="sm"
                style={{ cursor: 'pointer' }}
                onClick={() => setRoleFilter(roleFilter === r ? null : r)}
              >
                {r} ({summary?.byRole[r] ?? 0})
              </Badge>
            ))}
          </Group>
          <Badge variant="light" size="sm" ml="auto">
            {filtered.length} of {sessions.length}
          </Badge>
        </Group>
      </Card>

      <Card withBorder padding={0} radius="md">
        <SessionsTable
          sessions={pagedFiltered}
          isLoading={isLoading}
          totalFiltered={filtered.length}
          safePage={safePage}
          totalPages={totalPages}
          setPage={setPage}
        />
      </Card>
    </Stack>
  )
}
