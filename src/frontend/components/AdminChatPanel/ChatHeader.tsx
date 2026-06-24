import { Badge, Button, Group, Loader, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { TbBrain, TbClockBolt, TbMessageCircle, TbRefresh } from 'react-icons/tb'
import { formatAge } from './types'
import type { SyncResult } from './types'

export function ChatHeader({
  systemContext,
  contextLoadedAt,
  totalDocuments,
  lastSync,
  docsCount,
  isStreaming,
  syncResult,
  isSyncing,
  onRefreshContext,
  onSync,
  onNewSession,
}: {
  systemContext: string | null
  contextLoadedAt: Date | null
  totalDocuments: number | null
  lastSync: string | null
  docsCount: number
  isStreaming: boolean
  syncResult: SyncResult | null
  isSyncing: boolean
  onRefreshContext: () => void
  onSync: () => void
  onNewSession: () => void
}) {
  return (
    <Group justify="space-between" align="center">
      <Group gap="xs">
        <ThemeIcon size="md" variant="light" color="violet">
          <TbMessageCircle size={16} />
        </ThemeIcon>
        <div>
          <Text fw={600} size="sm">
            Chat AI
          </Text>
          <Text size="xs" c="dimmed">
            Tanya langsung tentang proyek, task, dan tim.
          </Text>
        </div>
        {systemContext && contextLoadedAt && (
          <Tooltip
            label="Konteks live (KPI, roster, GitHub, effort) di-load saat pesan pertama. Klik tombol Refresh Konteks untuk segarkan tanpa kehilangan history."
            withArrow
            multiline
            w={260}
          >
            <Badge size="xs" color="teal" variant="light" leftSection={<TbClockBolt size={10} />}>
              Konteks {formatAge(contextLoadedAt)}
            </Badge>
          </Tooltip>
        )}
        {totalDocuments != null && (
          <Tooltip
            label={`Knowledge base: ${totalDocuments} dokumen${lastSync ? ` | Sync: ${new Date(lastSync).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`}
            withArrow
          >
            <Badge size="xs" color="violet" variant="light" leftSection={<TbBrain size={10} />}>
              {totalDocuments} dok
            </Badge>
          </Tooltip>
        )}
        {docsCount > 0 && isStreaming && (
          <Badge size="xs" color="orange" variant="light">
            {docsCount} dok relevan
          </Badge>
        )}
        {syncResult && !isSyncing && (
          <Tooltip
            label={`Sync terakhir: +${syncResult.synced} synced, −${syncResult.pruned} pruned${syncResult.failedEmbeddings > 0 ? `, ⚠️ ${syncResult.failedEmbeddings} embed gagal` : ''} (${(syncResult.duration / 1000).toFixed(1)}s)`}
            withArrow
            multiline
            w={260}
          >
            <Badge size="xs" color="gray" variant="outline">
              +{syncResult.synced} / −{syncResult.pruned}
            </Badge>
          </Tooltip>
        )}
      </Group>
      <Group gap="xs">
        {systemContext && (
          <Tooltip label="Segarkan konteks live (KPI, roster) — history dipertahankan" withArrow>
            <Button
              size="xs"
              variant="subtle"
              color="teal"
              leftSection={<TbRefresh size={13} />}
              onClick={onRefreshContext}
              disabled={isStreaming}
            >
              Refresh Konteks
            </Button>
          </Tooltip>
        )}
        <Tooltip label="Perbarui knowledge base (sync semua dokumen ke AI)" withArrow>
          <Button
            size="xs"
            variant="subtle"
            color="violet"
            leftSection={isSyncing ? <Loader size={11} /> : <TbBrain size={13} />}
            onClick={onSync}
            disabled={isStreaming || isSyncing}
          >
            {isSyncing ? 'Menyinkron...' : 'Perbarui Pengetahuan'}
          </Button>
        </Tooltip>
        <Tooltip label="Sesi baru — bersihkan percakapan & refresh konteks" withArrow>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<TbRefresh size={13} />}
            onClick={onNewSession}
            disabled={isStreaming}
          >
            Sesi Baru
          </Button>
        </Tooltip>
      </Group>
    </Group>
  )
}
