import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, buildTasksQueryString } from './helpers'
import type { AssigneeOption, ProjectOption, TagListItem, TaskListItem } from './types'

// Data-fetching layer for the tasks panel: projects/tags/phases/members queries,
// the filtered tasks query, the chart query, and the writable-projects /
// members derivations. Extracted from useTasksPanelState to keep that file
// within file-health limits; behavior is unchanged. Composed back in via
// `...queries` spread.
export function useTaskQueries({
  activeProjectId,
  projectId,
  canWriteOverride,
  isAdmin,
  currentUserId,
  status,
  kind,
  assigneeFilter,
  tagFilter,
  phaseFilter,
  view,
  page,
  pageSize,
  search,
  priorityFilter,
  quickFilter,
  sortBy,
  sortDir,
  dueDateRange,
}: {
  activeProjectId: string | null
  projectId?: string
  canWriteOverride?: boolean
  isAdmin: boolean
  currentUserId: string | null
  status: string | null
  kind: string | null
  assigneeFilter: string | null
  tagFilter: string | null
  phaseFilter: string | null
  view: 'table' | 'gantt' | 'kanban'
  page: number
  pageSize: number
  search: string
  priorityFilter: string | null
  quickFilter: 'overdue' | 'openOnly' | 'blocked' | 'nodue' | null
  sortBy: string | null
  sortDir: 'asc' | 'desc'
  dueDateRange: [Date | null, Date | null]
}) {
  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ projects: ProjectOption[] }>('/api/projects'),
  })
  const tagsQ = useQuery({
    queryKey: ['tags', activeProjectId],
    queryFn: () => api<{ tags: TagListItem[] }>(`/api/projects/${activeProjectId}/tags`),
    enabled: !!activeProjectId,
  })
  const phasesQ = useQuery({
    queryKey: ['phases', activeProjectId],
    queryFn: () =>
      api<{ phases: Array<{ id: string; title: string; status: string; _count: { tasks: number } }> }>(
        `/api/projects/${activeProjectId}/phases`,
      ),
    enabled: !!activeProjectId,
  })
  // Anggota project aktif untuk dropdown filter assignee (reuse pola modal Create Task).
  const membersQ = useQuery({
    queryKey: ['project-members', activeProjectId, 'tasks-filter'],
    queryFn: () =>
      api<{ project: { members: Array<{ user: { id: string; name: string } }> } }>(`/api/projects/${activeProjectId}`),
    enabled: !!activeProjectId,
  })
  const members: AssigneeOption[] = useMemo(
    () => (membersQ.data?.project.members ?? []).map((m) => ({ id: m.user.id, name: m.user.name })),
    [membersQ.data],
  )

  const query = buildTasksQueryString({
    projectId: activeProjectId,
    status,
    kind,
    assigneeFilter,
    currentUserId,
    tagFilter,
    phaseFilter,
    view,
    page,
    pageSize,
    search,
    priorityFilter,
    quickFilter,
    sortBy,
    sortDir,
    dueDateRange,
  })
  const tasksQ = useQuery({
    queryKey: ['tasks', query],
    queryFn: () =>
      api<{ tasks: TaskListItem[]; total: number; limit: number; offset: number }>(
        `/api/tasks${query ? `?${query}` : ''}`,
      ),
    enabled: view !== 'kanban',
  })
  // Total/Open/Closed/Overdue stat cards + the Throughput/Status
  // breakdown/Top assignees charts both read from server-side aggregates
  // (uncapped) instead of a `/api/tasks` list, which the backend hard-caps at
  // 200 — deriving them from a capped fetch silently under-counted once a
  // project passed ~200 tasks.
  const dashboardStatsQ = useQuery({
    queryKey: ['tasks-dashboard-stats', activeProjectId],
    queryFn: () =>
      api<{ total: number; open: number; closed: number; overdue: number }>(
        `/api/tasks/dashboard-stats${activeProjectId ? `?projectId=${activeProjectId}` : ''}`,
      ),
    staleTime: 60_000,
  })
  const dashboardChartsQ = useQuery({
    queryKey: ['tasks-dashboard-charts', activeProjectId],
    queryFn: () =>
      api<{
        throughput: Array<{ date: string; created: number; closed: number }>
        statusBreakdown: Record<string, number>
        topAssignees: Array<{ id: string; name: string; count: number }>
      }>(`/api/tasks/dashboard-charts${activeProjectId ? `?projectId=${activeProjectId}` : ''}`),
    staleTime: 60_000,
  })

  const projects = projectsQ.data?.projects ?? []
  const writableProjects = projects.filter((p) => {
    if (projectId && p.id === projectId && canWriteOverride !== undefined) return canWriteOverride
    if (isAdmin) return true
    if (typeof p.canWrite === 'boolean') return p.canWrite
    return p.myRole !== null && p.myRole !== 'VIEWER'
  })
  const leadProjectIds = useMemo(() => {
    const s = new Set<string>()
    for (const p of projects) if (p.myRole === 'OWNER' || p.myRole === 'PM') s.add(p.id)
    return s
  }, [projects])

  return {
    projectsQ,
    tagsQ,
    phasesQ,
    members,
    tasksQ,
    dashboardStatsQ,
    dashboardChartsQ,
    projects,
    writableProjects,
    leadProjectIds,
  }
}
