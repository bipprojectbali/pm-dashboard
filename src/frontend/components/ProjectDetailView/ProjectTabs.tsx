import { ActionIcon, Badge, Box, Group, Menu, Tabs } from '@mantine/core'
import {
  TbDots,
  TbFlag,
  TbHistory,
  TbLayoutColumns,
  TbListCheck,
  TbReport,
  TbSettings,
  TbTarget,
  TbUsers,
} from 'react-icons/tb'
import { ExtensionsSection } from '../ExtensionsSection'
import { MembersSection } from '../MembersSection'
import { MilestonesSection } from '../MilestonesSection'
import { PhasesSection } from '../PhasesSection'
import { ProjectSettingsTab } from '../ProjectSettingsTab'
import type { MemberRole, ProjectDetail } from '../ProjectsPanel'
import { RetroTab } from '../RetroTab'
import { TasksPanel } from '../TasksPanel'
import { OverviewTab } from './OverviewTab'
import { computeCanManage } from './types'
import type { ProjectDetailTab } from './types'

function TabCount({ value }: { value?: number }) {
  if (value === undefined) return null
  return (
    <Badge size="xs" variant="light" color="gray" circle>
      {value}
    </Badge>
  )
}

export function ProjectTabs({
  project,
  tab,
  onTabChange,
  systemRole,
  canWrite,
  myRole,
  onDeleted,
}: {
  project: ProjectDetail
  tab: ProjectDetailTab
  onTabChange: (tab: ProjectDetailTab) => void
  systemRole: string | null
  canWrite: boolean
  myRole: MemberRole | null
  onDeleted: () => void
}) {
  const tabCounts = project._count
  const canManage = computeCanManage(myRole, systemRole)
  const isSecondaryTab = ['extensions', 'retro', 'settings'].includes(tab)

  return (
    <Tabs
      value={tab}
      onChange={(v) => v && onTabChange(v as ProjectDetailTab)}
      keepMounted={false}
      variant="pills"
    >
      <Group gap={4} mb="md" wrap="nowrap" align="center">
        <Tabs.List style={{ gap: 4, flexWrap: 'nowrap' }}>
          <Tabs.Tab value="overview" leftSection={<TbTarget size={14} />}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab
            value="tasks"
            leftSection={<TbListCheck size={14} />}
            rightSection={<TabCount value={tabCounts?.tasks} />}
          >
            Tasks
          </Tabs.Tab>
          <Tabs.Tab
            value="team"
            leftSection={<TbUsers size={14} />}
            rightSection={<TabCount value={tabCounts?.members} />}
          >
            Team
          </Tabs.Tab>
          <Tabs.Tab
            value="milestones"
            leftSection={<TbFlag size={14} />}
            rightSection={<TabCount value={tabCounts?.milestones} />}
          >
            Milestones
          </Tabs.Tab>
          <Tabs.Tab
            value="phases"
            leftSection={<TbLayoutColumns size={14} />}
            rightSection={<TabCount value={tabCounts?.phases} />}
          >
            Phases
          </Tabs.Tab>
        </Tabs.List>

        <Menu shadow="md" radius="md" position="bottom-end">
          <Menu.Target>
            <ActionIcon
              variant={isSecondaryTab ? 'filled' : 'subtle'}
              color={isSecondaryTab ? 'blue' : 'gray'}
              size="sm"
              radius="md"
            >
              <TbDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Lainnya</Menu.Label>
            <Menu.Item
              leftSection={<TbHistory size={14} />}
              onClick={() => onTabChange('extensions')}
              style={{ fontWeight: tab === 'extensions' ? 700 : undefined }}
            >
              Extensions
            </Menu.Item>
            <Menu.Item
              leftSection={<TbReport size={14} />}
              onClick={() => onTabChange('retro')}
              style={{ fontWeight: tab === 'retro' ? 700 : undefined }}
            >
              Retro
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              leftSection={<TbSettings size={14} />}
              onClick={() => onTabChange('settings')}
              style={{ fontWeight: tab === 'settings' ? 700 : undefined }}
              color="dimmed"
            >
              Settings
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {isSecondaryTab && (
          <Box
            px="sm"
            py={4}
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              background: 'var(--mantine-color-blue-light)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--mantine-color-blue-filled)',
            }}
          >
            {tab === 'extensions' && <TbHistory size={13} />}
            {tab === 'retro' && <TbReport size={13} />}
            {tab === 'settings' && <TbSettings size={13} />}
            {tab === 'extensions' ? 'Extensions' : tab === 'retro' ? 'Retro' : 'Settings'}
          </Box>
        )}
      </Group>

      <Tabs.Panel value="overview" pt="md">
        <OverviewTab project={project} onOpenTasks={() => onTabChange('tasks')} />
      </Tabs.Panel>
      <Tabs.Panel value="tasks" pt="md">
        <TasksPanel projectId={project.id} canWriteOverride={canWrite} />
      </Tabs.Panel>
      <Tabs.Panel value="team" pt="md">
        <MembersSection
          projectId={project.id}
          myRole={myRole}
          systemRole={systemRole}
          ownerId={project.ownerId}
        />
      </Tabs.Panel>
      <Tabs.Panel value="milestones" pt="md">
        <MilestonesSection projectId={project.id} canManage={canManage} />
      </Tabs.Panel>
      <Tabs.Panel value="phases" pt="md">
        <PhasesSection projectId={project.id} canManage={canManage} />
      </Tabs.Panel>
      <Tabs.Panel value="extensions" pt="md">
        <ExtensionsSection
          projectId={project.id}
          currentEndAt={project.endsAt}
          startsAt={project.startsAt}
          canExtend={canManage}
        />
      </Tabs.Panel>
      <Tabs.Panel value="retro" pt="md">
        <RetroTab projectId={project.id} />
      </Tabs.Panel>
      <Tabs.Panel value="settings" pt="md">
        <ProjectSettingsTab project={project} systemRole={systemRole} onDeleted={onDeleted} />
      </Tabs.Panel>
    </Tabs>
  )
}
