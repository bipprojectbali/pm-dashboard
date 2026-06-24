import { Box, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { ProjectCard } from './ProjectCard'
import { ProjectListRow } from './ProjectListRow'
import { STATUS_ACCENT, STATUS_GROUP_LABEL, STATUS_GROUP_ORDER, type ProjectListItem } from './types'

export function ProjectsGrid({
  filtered,
  view,
  density,
  groupByStatus,
  canCreateProject,
  openProject,
}: {
  filtered: ProjectListItem[]
  view: 'grid' | 'list' | 'timeline'
  density: 'comfortable' | 'compact'
  groupByStatus: boolean
  canCreateProject: boolean
  openProject: (id: string, tab?: 'overview' | 'settings') => void
}) {
  const renderItems = (items: ProjectListItem[]) =>
    view === 'list' ? (
      <Stack gap="xs">
        {items.map((p) => (
          <ProjectListRow
            key={p.id}
            project={p}
            isSystemAdmin={canCreateProject}
            onOpen={() => openProject(p.id)}
            onEdit={() => openProject(p.id, 'settings')}
          />
        ))}
      </Stack>
    ) : (
      <SimpleGrid
        cols={density === 'compact' ? { base: 1, sm: 2, md: 3, lg: 4 } : { base: 1, sm: 2, md: 3 }}
        spacing="md"
      >
        {items.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            density={density}
            isSystemAdmin={canCreateProject}
            onOpen={() => openProject(p.id)}
            onEdit={() => openProject(p.id, 'settings')}
          />
        ))}
      </SimpleGrid>
    )

  if (!groupByStatus) return renderItems(filtered)

  const groups = STATUS_GROUP_ORDER.map((status) => ({
    status,
    items: filtered.filter((p) => p.status === status),
  })).filter((g) => g.items.length > 0)

  return (
    <Stack gap="xl">
      {groups.map((g) => (
        <Stack key={g.status} gap="sm">
          <Group gap={8} align="center">
            <Box
              style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_ACCENT[g.status], flexShrink: 0 }}
            />
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
              {STATUS_GROUP_LABEL[g.status]}
            </Text>
            <Text size="xs" c="dimmed">
              · {g.items.length}
            </Text>
          </Group>
          {renderItems(g.items)}
        </Stack>
      ))}
    </Stack>
  )
}
