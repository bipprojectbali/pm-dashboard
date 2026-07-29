import { ActionIcon, Badge, Group, Pagination, Stack, Text, Title, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { TbDownload, TbRefresh, TbTrash } from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'
import { AuditFilters } from './auditlogspanel/AuditFilters'
import { AuditLogsTable } from './auditlogspanel/AuditLogsTable'
import { AuditStatCards } from './auditlogspanel/AuditStatCards'
import { AuditTrendChart } from './auditlogspanel/AuditTrendChart'
import { downloadCsv, PAGE_SIZE } from './auditlogspanel/constants'
import type { AdminUser, AuditLogEntry } from './auditlogspanel/types'

export function AuditLogsPanel() {
  const [actionFilter, setActionFilter] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState<string | null>(null)
  const [windowFilter, setWindowFilter] = useState<string>('7')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const { data: sessionData } = useSession()
  const canClear = sessionData?.user?.role === 'SUPER_ADMIN'

  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () =>
      fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()) as Promise<{ users: AdminUser[] }>,
  })

  // Stats + trend chart: always last 14 days, not affected by windowFilter
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'logs', 'audit-stats'],
    queryFn: () => {
      const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      return fetch(`/api/admin/logs/audit?limit=500&since=${encodeURIComponent(since14d)}`, {
        credentials: 'include',
      }).then((r) => r.json()) as Promise<{ logs: AuditLogEntry[] }>
    },
    staleTime: 60_000,
  })

  // Table data: server-side filtered + paginated
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'logs', 'audit', actionFilter, userFilter, windowFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) })
      if (actionFilter) params.set('action', actionFilter)
      if (userFilter) params.set('userId', userFilter)
      if (windowFilter !== 'all') {
        const since = new Date(Date.now() - Number(windowFilter) * 24 * 60 * 60 * 1000).toISOString()
        params.set('since', since)
      }
      return fetch(`/api/admin/logs/audit?${params}`, { credentials: 'include' }).then((r) => r.json()) as Promise<{
        logs: AuditLogEntry[]
        total: number
        limit: number
        offset: number
      }>
    },
  })

  const clearLogs = useMutation({
    mutationFn: () =>
      fetch('/api/admin/logs/audit', { method: 'DELETE', credentials: 'include' }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'logs', 'audit'] })
      notifySuccess({ message: 'Audit log dikosongkan.' })
    },
    onError: (err) => notifyError(err),
  })

  const pagedLogs = data?.logs ?? []
  const total = data?.total ?? 0
  const allStatsLogs = statsData?.logs ?? []

  const stats = useMemo(() => {
    const now = Date.now()
    const cutoff24 = now - 24 * 60 * 60 * 1000
    const last24 = allStatsLogs.filter((l) => new Date(l.createdAt).getTime() >= cutoff24)
    const loginOk = last24.filter((l) => l.action === 'LOGIN').length
    const loginFail = last24.filter((l) => l.action === 'LOGIN_FAILED').length
    const loginBlocked = last24.filter((l) => l.action === 'LOGIN_BLOCKED').length
    const uniqueUsers = new Set(last24.map((l) => l.userId).filter(Boolean)).size
    return { loginOk, loginFail, loginBlocked, uniqueUsers }
  }, [allStatsLogs])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  useEffect(() => {
    setPage(1)
  }, [actionFilter, userFilter, windowFilter])

  const userOptions = (usersData?.users ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))

  const confirmClear = () =>
    modals.openConfirmModal({
      title: 'Clear audit logs',
      children: <Text size="sm">Hapus semua audit logs? Tindakan ini tidak bisa dibatalkan.</Text>,
      labels: { confirm: 'Clear all', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => clearLogs.mutate(),
    })

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Group gap="sm">
          <Title order={3}>Audit Logs</Title>
          <Badge variant="light" color="gray" size="sm">
            jejak aktivitas
          </Badge>
          <InfoTip
            width={360}
            label={`Jejak aktivitas yang persisted di DB — autentikasi (login/logout/gagal/blokir), manajemen user & role, serta perubahan pada project, task, phase, milestone, tag, evidence, tiket QC, access token, dan aksi dari coding agent. Filter action di bawah menampilkan seluruh jenis yang tercatat. Retensi default ${90} hari (AUDIT_LOG_RETENTION_DAYS).`}
          />
        </Group>
        <Group gap="sm">
          <Tooltip label="Ekspor CSV (halaman ini)">
            <ActionIcon variant="subtle" color="blue" onClick={() => downloadCsv(pagedLogs)}>
              <TbDownload size={16} />
            </ActionIcon>
          </Tooltip>
          {canClear && (
            <Tooltip label="Kosongkan semua">
              <ActionIcon variant="subtle" color="red" onClick={confirmClear} loading={clearLogs.isPending}>
                <TbTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" color="gray" onClick={() => refetch()} loading={isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <AuditStatCards stats={stats} />
      <AuditTrendChart logs={allStatsLogs} />
      <AuditFilters
        windowFilter={windowFilter}
        onWindowFilterChange={(v) => { setWindowFilter(v); setPage(1) }}
        userFilter={userFilter}
        onUserFilterChange={(v) => { setUserFilter(v); setPage(1) }}
        userOptions={userOptions}
        actionFilter={actionFilter}
        onActionFilterChange={(v) => { setActionFilter(v); setPage(1) }}
        total={total}
      />
      <AuditLogsTable
        logs={pagedLogs}
        isLoading={isLoading}
        actionFilter={actionFilter}
        userFilter={userFilter}
        windowFilter={windowFilter}
      />
      {total > PAGE_SIZE && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(safePage * PAGE_SIZE, total)} dari {total}
          </Text>
          <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Stack>
  )
}
