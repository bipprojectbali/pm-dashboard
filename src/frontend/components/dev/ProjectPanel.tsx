import { Group, Select, Stack, Title } from '@mantine/core'
import { useState } from 'react'
import { ApiRoutesFlow } from '@/frontend/components/dev/ApiRoutesFlow'
import { DependenciesFlow } from '@/frontend/components/dev/DependenciesFlow'
import { EnvMapFlow } from '@/frontend/components/dev/EnvMapFlow'
import { FileStructureFlow } from '@/frontend/components/dev/FileStructureFlow'
import { LiveRequestsFlow } from '@/frontend/components/dev/LiveRequestsFlow'
import { MigrationsFlow } from '@/frontend/components/dev/MigrationsFlow'
import { SessionsFlow } from '@/frontend/components/dev/SessionsFlow'
import { DataFlowView, UserFlowView } from '@/frontend/components/dev/StaticFlows'
import { TestCoverageFlow } from '@/frontend/components/dev/TestCoverageFlow'

const projectSubViews = [
  'api-routes',
  'file-structure',
  'user-flow',
  'data-flow',
  'env-map',
  'test-coverage',
  'dependencies',
  'migrations',
  'sessions',
  'live-requests',
] as const
type ProjectSubView = (typeof projectSubViews)[number]

export function ProjectPanel() {
  const [subView, setSubView] = useState<ProjectSubView>('api-routes')

  return (
    <Stack gap={0} h="calc(100vh - 32px)">
      <Group px="md" py="xs" justify="space-between">
        <Title order={3}>Project</Title>
        <Select
          size="xs"
          w={200}
          value={subView}
          onChange={(v) => v && setSubView(v as ProjectSubView)}
          data={[
            {
              group: 'Architecture',
              items: [
                { label: 'API Routes', value: 'api-routes' },
                { label: 'File Structure', value: 'file-structure' },
                { label: 'User Flow', value: 'user-flow' },
                { label: 'Data Flow', value: 'data-flow' },
              ],
            },
            {
              group: 'DevOps',
              items: [
                { label: 'Env Variables', value: 'env-map' },
                { label: 'Test Coverage', value: 'test-coverage' },
                { label: 'Dependencies', value: 'dependencies' },
                { label: 'Migrations', value: 'migrations' },
              ],
            },
            {
              group: 'Live',
              items: [
                { label: 'Sessions', value: 'sessions' },
                { label: 'Live Requests', value: 'live-requests' },
              ],
            },
          ]}
        />
      </Group>
      {subView === 'api-routes' && <ApiRoutesFlow />}
      {subView === 'file-structure' && <FileStructureFlow />}
      {subView === 'user-flow' && <UserFlowView />}
      {subView === 'data-flow' && <DataFlowView />}
      {subView === 'env-map' && <EnvMapFlow />}
      {subView === 'test-coverage' && <TestCoverageFlow />}
      {subView === 'dependencies' && <DependenciesFlow />}
      {subView === 'migrations' && <MigrationsFlow />}
      {subView === 'sessions' && <SessionsFlow />}
      {subView === 'live-requests' && <LiveRequestsFlow />}
    </Stack>
  )
}
