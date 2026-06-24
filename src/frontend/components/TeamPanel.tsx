import { Badge, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { usePresence } from '@/frontend/hooks/usePresence'
import { TeamActivitySection } from './teampanel/TeamActivitySection'
import { TeamDirectorySection } from './teampanel/TeamDirectorySection'
import { TeamLoadSection } from './teampanel/TeamLoadSection'
import { TeamOnlineSection } from './teampanel/TeamOnlineSection'
import { ROLE_COLOR, type TeamActivityResponse, type TeamResponse } from './teampanel/types'

type SortOption = 'load' | 'overdue' | 'name'

export function TeamPanel() {
  const navigate = useNavigate()
  const { onlineUserIds } = usePresence()
  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<SortOption>('load')

  const teamQ = useQuery<TeamResponse>({
    queryKey: ['me', 'team'],
    queryFn: () => fetch('/api/me/team', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 60_000,
  })
  const activityQ = useQuery<TeamActivityResponse>({
    queryKey: ['me', 'team-activity'],
    queryFn: () => fetch('/api/me/team-activity?limit=30', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 60_000,
  })

  const teammates = teamQ.data?.teammates ?? []
  const projects = teamQ.data?.projects ?? []
  const activity = activityQ.data?.activity ?? []

  const filtered = useMemo(() => {
    if (!projectFilter) return teammates
    return teammates.filter((t) => t.sharedProjects.some((p) => p.projectId === projectFilter))
  }, [teammates, projectFilter])

  const onlineTeammates = useMemo(() => filtered.filter((t) => onlineSet.has(t.id)), [filtered, onlineSet])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sort === 'load') arr.sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name))
    else if (sort === 'overdue') arr.sort((a, b) => b.overdueTasks - a.overdueTasks || b.openTasks - a.openTasks)
    else arr.sort((a, b) => a.name.localeCompare(b.name))
    return arr
  }, [filtered, sort])

  const maxLoad = Math.max(10, ...sorted.map((t) => t.openTasks))

  const goToTaskDetail = (taskId: string, projectId: string) =>
    navigate({ to: '/pm', search: { tab: 'tasks', taskId, projectId } })

  const goToProject = (projectId: string) => navigate({ to: '/pm', search: { tab: 'projects', projectId } })

  return (
    <Stack gap="lg">
      <div>
        <Title order={3}>Tim</Title>
        <Text c="dimmed" size="sm">
          Teman se-proyek kamu &mdash; siapa online, siapa kelebihan beban, apa yang lagi terjadi.
        </Text>
      </div>

      {projects.length > 1 && (
        <Group gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            Proyek:
          </Text>
          <Badge
            variant={projectFilter === null ? 'filled' : 'light'}
            color="gray"
            size="sm"
            style={{ cursor: 'pointer' }}
            onClick={() => setProjectFilter(null)}
          >
            Semua
          </Badge>
          {projects.map((p) => (
            <Badge
              key={p.id}
              variant={projectFilter === p.id ? 'filled' : 'light'}
              color={ROLE_COLOR[p.myRole] ?? 'blue'}
              size="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => setProjectFilter(projectFilter === p.id ? null : p.id)}
            >
              {p.name}
            </Badge>
          ))}
        </Group>
      )}

      <TeamOnlineSection isLoading={teamQ.isLoading} onlineTeammates={onlineTeammates} />

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <TeamLoadSection
          isLoading={teamQ.isLoading}
          sorted={sorted}
          onlineSet={onlineSet}
          sort={sort}
          onSortChange={setSort}
          maxLoad={maxLoad}
        />
        <TeamActivitySection
          isLoading={activityQ.isLoading}
          activity={activity}
          onTaskClick={goToTaskDetail}
        />
      </SimpleGrid>

      <TeamDirectorySection
        isLoading={teamQ.isLoading}
        sorted={sorted}
        onlineSet={onlineSet}
        onProjectClick={goToProject}
      />
    </Stack>
  )
}
