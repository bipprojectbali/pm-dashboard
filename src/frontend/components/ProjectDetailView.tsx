import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TbAlertTriangle, TbArrowLeft, TbChecks, TbCopy, TbRefresh } from 'react-icons/tb'
import { useSession } from '../hooks/useAuth'
import type { MemberRole, ProjectDetail } from './ProjectsPanel'
import { ProjectHeader } from './ProjectDetailView/ProjectHeader'
import { ProjectTabs } from './ProjectDetailView/ProjectTabs'
import { PROJECT_DETAIL_TABS, api } from './ProjectDetailView/types'
import type { ProjectDetailTab } from './ProjectDetailView/types'
import { Breadcrumbs } from './shared/Breadcrumbs'

export { PROJECT_DETAIL_TABS }
export type { ProjectDetailTab }

export function ProjectDetailView({
  projectId,
  tab,
  onTabChange,
  onBack,
  onDeleted,
}: {
  projectId: string
  tab: ProjectDetailTab
  onTabChange: (tab: ProjectDetailTab) => void
  onBack: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const session = useSession()
  const systemRole = session.data?.user?.role ?? null
  const detailQ = useQuery({
    queryKey: ['project', projectId],
    queryFn: () =>
      api<{ project: ProjectDetail; myRole: string | null; canWrite: boolean }>(`/api/projects/${projectId}`),
  })

  const project = detailQ.data?.project
  const myRole: MemberRole | null = (detailQ.data?.myRole as MemberRole) ?? null
  const canWrite = detailQ.data?.canWrite ?? false

  useHotkeys([['Escape', onBack]])

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Tooltip label="Kembali ke daftar proyek (Esc)">
            <ActionIcon variant="subtle" size="lg" onClick={onBack} aria-label="Back">
              <TbArrowLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <Breadcrumbs
            items={[{ label: 'Projects', onClick: onBack }, { label: project?.name ?? projectId.slice(0, 8) }]}
          />
          {project && (
            <CopyButton value={project.id} timeout={1500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'ID disalin' : 'Salin project ID'}>
                  <ActionIcon variant="subtle" size="sm" onClick={copy} color={copied ? 'teal' : 'gray'}>
                    {copied ? <TbChecks size={14} /> : <TbCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          )}
        </Group>
        <Group gap="xs">
          {detailQ.isFetching && !detailQ.isLoading && (
            <Badge variant="dot" color="blue" size="sm">
              Sinkronisasi…
            </Badge>
          )}
          <Tooltip label="Refresh data">
            <ActionIcon variant="light" size="lg" onClick={() => detailQ.refetch()} loading={detailQ.isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {detailQ.isLoading ? (
        <Stack gap="md">
          <Card withBorder padding="md" radius="md">
            <Group gap="sm" align="flex-start">
              <Skeleton height={48} width={48} radius="md" />
              <Stack gap={6} style={{ flex: 1 }}>
                <Skeleton height={24} width="40%" />
                <Group gap={6}>
                  <Skeleton height={18} width={60} radius="xl" />
                  <Skeleton height={18} width={70} radius="xl" />
                  <Skeleton height={18} width={50} radius="xl" />
                </Group>
                <Skeleton height={14} width="80%" />
              </Stack>
            </Group>
          </Card>
          <Group gap="xs">
            {PROJECT_DETAIL_TABS.map((t) => (
              <Skeleton key={t} height={34} width={110} radius="sm" />
            ))}
          </Group>
          <Card withBorder padding="md" radius="md">
            <Stack gap="sm">
              <Skeleton height={18} width="30%" />
              <Skeleton height={120} />
              <Skeleton height={80} />
            </Stack>
          </Card>
        </Stack>
      ) : detailQ.error ? (
        <Alert color="red" icon={<TbAlertTriangle size={18} />} title="Gagal memuat proyek" radius="md">
          <Stack gap="sm">
            <Text size="sm">{(detailQ.error as Error).message}</Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() => detailQ.refetch()}
                leftSection={<TbRefresh size={14} />}
              >
                Coba lagi
              </Button>
              <Button size="xs" variant="subtle" onClick={onBack}>
                Kembali
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : !project ? (
        <Alert color="yellow" icon={<TbAlertTriangle size={18} />} radius="md">
          Proyek tidak ditemukan atau kamu tidak punya akses.
        </Alert>
      ) : (
        <>
          <ProjectHeader project={project} systemRole={systemRole} canWrite={canWrite} myRole={myRole} />
          <ProjectTabs
            project={project}
            tab={tab}
            onTabChange={onTabChange}
            systemRole={systemRole}
            canWrite={canWrite}
            myRole={myRole}
            onDeleted={() => {
              qc.invalidateQueries({ queryKey: ['projects'] })
              qc.invalidateQueries({ queryKey: ['milestones', 'all'] })
              onDeleted()
            }}
          />
        </>
      )}
    </Stack>
  )
}
