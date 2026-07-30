import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { TbAlertTriangle, TbFilterX, TbFolder, TbPlus, TbRefresh, TbSearch, TbX } from 'react-icons/tb'
import { CreateProjectModal } from './projects/CreateProjectModal'
import { PortfolioStat } from './projects/PortfolioStat'
import { ProjectsFilterBar } from './projects/ProjectsFilterBar'
import { ProjectsGanttView } from './projects/ProjectsGanttView'
import { ProjectsGrid } from './projects/ProjectsGrid'
import { useProjectsPanelState } from './projects/useProjectsPanelState'

export { ProjectsGanttView } from './projects/ProjectsGanttView'
export type {
  MemberRole,
  ProjectDetail,
  ProjectListItem,
  ProjectPriority,
  ProjectStatus,
  ProjectUser,
  ProjectVisibility,
} from './projects/types'

export function ProjectsPanel() {
  const {
    canCreateProject,
    createOpen,
    setCreateOpen,
    scope,
    setScope,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    userFilter,
    setUserFilter,
    userFilterMode,
    setUserFilterMode,
    derivedFilter,
    setDerivedFilter,
    search,
    setSearch,
    sort,
    setSort,
    view,
    setView,
    groupByStatus,
    setGroupByStatus,
    density,
    setDensity,
    projectsQ,
    create,
    projects,
    totalProjects,
    isTruncated,
    statusCounts,
    overdueCount,
    atRiskCount,
    delayedCount,
    filtered,
    userOptions,
    userList,
    hasActiveFilters,
    clearFilters,
    openProject,
  } = useProjectsPanelState()

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 280px' }}>
          <Title order={3}>Projects</Title>
          <Text c="dimmed" size="sm">
            {scope === 'mine'
              ? "Projects you're a member of. Create one to start tracking tasks + AW activity."
              : 'All projects you can see. Switch scope to "Mine" for only the ones you belong to.'}
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="sm"
            placeholder="Search name or description…"
            leftSection={<TbSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            rightSection={
              search ? (
                <ActionIcon variant="subtle" size="xs" color="gray" onClick={() => setSearch('')}>
                  <TbX size={12} />
                </ActionIcon>
              ) : null
            }
            w={260}
          />
          <Tooltip label="Refresh">
            <ActionIcon variant="light" size="lg" onClick={() => projectsQ.refetch()} loading={projectsQ.isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          {canCreateProject && (
            <Button leftSection={<TbPlus size={16} />} onClick={() => setCreateOpen(true)}>
              New Project
            </Button>
          )}
        </Group>
      </Group>

      {isTruncated && (
        <Alert color="yellow" variant="light" icon={<TbAlertTriangle size={16} />} p="xs">
          <Text size="xs">
            Menampilkan {projects.length} dari {totalProjects} proyek. Statistik & filter di bawah hanya menghitung{' '}
            {projects.length} proyek yang termuat — persempit dengan pencarian/scope untuk melihat sisanya.
          </Text>
        </Alert>
      )}

      {projects.length > 0 && (
        <Group gap="md" wrap="wrap" align="stretch">
          <Stack gap={4} style={{ minWidth: 110 }}>
            <Text size="10px" c="dimmed" tt="uppercase" fw={700}>
              Quick
            </Text>
            <PortfolioStat
              label="All"
              value={projects.length}
              color="blue"
              active={!hasActiveFilters}
              onClick={clearFilters}
            />
          </Stack>
          <Divider orientation="vertical" />
          <Stack gap={4} style={{ flex: 2, minWidth: 260 }}>
            <Group gap={6} align="baseline">
              <Text size="10px" c="dimmed" tt="uppercase" fw={700}>
                Status
              </Text>
              <Text size="10px" c="dimmed">
                (pick one)
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 3 }} spacing="xs">
              <PortfolioStat
                label="Active"
                value={statusCounts.ACTIVE}
                color="blue"
                active={statusFilter === 'ACTIVE'}
                onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? null : 'ACTIVE')}
              />
              <PortfolioStat
                label="On hold"
                value={statusCounts.ON_HOLD}
                color="yellow"
                active={statusFilter === 'ON_HOLD'}
                onClick={() => setStatusFilter(statusFilter === 'ON_HOLD' ? null : 'ON_HOLD')}
              />
              <PortfolioStat
                label="Completed"
                value={statusCounts.COMPLETED}
                color="green"
                active={statusFilter === 'COMPLETED'}
                onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? null : 'COMPLETED')}
              />
              <PortfolioStat
                label="Draft"
                value={statusCounts.DRAFT}
                color="gray"
                active={statusFilter === 'DRAFT'}
                muted={statusCounts.DRAFT === 0 && statusFilter !== 'DRAFT'}
                onClick={() => setStatusFilter(statusFilter === 'DRAFT' ? null : 'DRAFT')}
              />
              <PortfolioStat
                label="Cancelled"
                value={statusCounts.CANCELLED}
                color="dark"
                active={statusFilter === 'CANCELLED'}
                muted={statusCounts.CANCELLED === 0 && statusFilter !== 'CANCELLED'}
                onClick={() => setStatusFilter(statusFilter === 'CANCELLED' ? null : 'CANCELLED')}
              />
            </SimpleGrid>
          </Stack>
          <Divider orientation="vertical" />
          <Stack gap={4} style={{ flex: 1.5, minWidth: 200 }}>
            <Group gap={6} align="baseline">
              <Text size="10px" c="dimmed" tt="uppercase" fw={700}>
                Health
              </Text>
              <Text size="10px" c="dimmed">
                (pick one)
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 3 }} spacing="xs">
              <PortfolioStat
                label="Overdue"
                value={overdueCount}
                color="red"
                icon={<TbAlertTriangle size={14} />}
                active={derivedFilter === 'overdue'}
                muted={overdueCount === 0 && derivedFilter !== 'overdue'}
                onClick={
                  overdueCount > 0 ? () => setDerivedFilter(derivedFilter === 'overdue' ? null : 'overdue') : undefined
                }
              />
              <PortfolioStat
                label="At risk"
                value={atRiskCount}
                color="yellow"
                active={derivedFilter === 'atRisk'}
                muted={atRiskCount === 0 && derivedFilter !== 'atRisk'}
                onClick={
                  atRiskCount > 0 ? () => setDerivedFilter(derivedFilter === 'atRisk' ? null : 'atRisk') : undefined
                }
              />
              <PortfolioStat
                label="Delayed"
                value={delayedCount}
                color="red"
                active={derivedFilter === 'delayed'}
                muted={delayedCount === 0 && derivedFilter !== 'delayed'}
                onClick={
                  delayedCount > 0 ? () => setDerivedFilter(derivedFilter === 'delayed' ? null : 'delayed') : undefined
                }
              />
            </SimpleGrid>
          </Stack>
        </Group>
      )}

      {projects.length > 0 && (
        <ProjectsFilterBar
          scope={scope}
          setScope={setScope}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          userFilter={userFilter}
          setUserFilter={setUserFilter}
          userFilterMode={userFilterMode}
          setUserFilterMode={setUserFilterMode}
          sort={sort}
          setSort={setSort}
          density={density}
          setDensity={setDensity}
          view={view}
          setView={setView}
          groupByStatus={groupByStatus}
          setGroupByStatus={setGroupByStatus}
          userList={userList}
          userOptions={userOptions}
          hasActiveFilters={hasActiveFilters}
          filtered={filtered}
          projects={projects}
          clearFilters={clearFilters}
        />
      )}

      {filtered.length === 0 && !projectsQ.isLoading ? (
        <Card withBorder p="xl" radius="md">
          <Stack align="center" gap="sm">
            <TbFolder size={40} />
            <Text fw={500}>
              {projects.length === 0
                ? 'No projects yet'
                : hasActiveFilters
                  ? 'No projects match your filters'
                  : 'Nothing to show'}
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={360}>
              {projects.length === 0
                ? canCreateProject
                  ? 'Create your first project to start organizing tasks and tracking team progress.'
                  : 'You have not been added to any project yet. Ask an admin to invite you.'
                : hasActiveFilters
                  ? 'Try clearing filters or searching by a different keyword.'
                  : 'Pick a different view or create a new project.'}
            </Text>
            {projects.length === 0 && canCreateProject ? (
              <Button leftSection={<TbPlus size={16} />} onClick={() => setCreateOpen(true)}>
                Create Project
              </Button>
            ) : hasActiveFilters ? (
              <Button variant="light" leftSection={<TbFilterX size={16} />} onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </Stack>
        </Card>
      ) : view === 'timeline' ? (
        <ProjectsGanttView projects={filtered} onSelect={(p) => openProject(p.id)} />
      ) : (
        <ProjectsGrid
          filtered={filtered}
          view={view}
          density={density}
          groupByStatus={groupByStatus}
          canCreateProject={canCreateProject}
          openProject={openProject}
        />
      )}

      <CreateProjectModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(body) => create.mutate(body)}
        onReset={() => create.reset()}
        loading={create.isPending}
        error={create.error?.message}
      />
    </Stack>
  )
}
