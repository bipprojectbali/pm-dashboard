import { useQuery } from '@tanstack/react-query'
import type { OverviewNotification, OverviewTask } from './types'

type UpcomingEvent = {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  location: string | null
  tags: Array<{ tagId: string; tag: { name: string; color: string } }>
  project: { id: string; name: string } | null
}

export function useOverviewData() {
  const projectsQ = useQuery<{
    projects: Array<{ id: string; name?: string; archivedAt: string | null; _count: { tasks: number } }>
  }>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects', { credentials: 'include' }).then((r) => r.json()),
  })

  // "Task Terbuka" / "Bug Terbuka" cover every non-CLOSED status, not just OPEN.
  // Read the server `total` (unaffected by the 200-row page cap) via openOnly so
  // the counts stay accurate — the old ?status=OPEN under-counted IN_PROGRESS/
  // READY_FOR_QC/REOPENED tasks.
  const openTasksQ = useQuery<{ total: number }>({
    queryKey: ['tasks', 'openOnly', 'count'],
    queryFn: () => fetch('/api/tasks?openOnly=1&limit=1', { credentials: 'include' }).then((r) => r.json()),
  })
  const openBugsQ = useQuery<{ total: number }>({
    queryKey: ['tasks', 'openOnly', 'bug', 'count'],
    queryFn: () => fetch('/api/tasks?openOnly=1&kind=BUG&limit=1', { credentials: 'include' }).then((r) => r.json()),
  })

  const myTasksQ = useQuery<{ tasks: OverviewTask[] }>({
    queryKey: ['tasks', 'mine=1', 'overview'],
    queryFn: () => fetch('/api/tasks?mine=1&limit=300', { credentials: 'include' }).then((r) => r.json()),
  })

  const notifsQ = useQuery<{ notifications: OverviewNotification[] }>({
    queryKey: ['me', 'notifications', 'overview'],
    queryFn: () => fetch('/api/me/notifications?limit=10', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 60_000,
  })

  const upcomingEventsQ = useQuery<{ events: UpcomingEvent[] }>({
    queryKey: ['events', 'badge'],
    queryFn: () => fetch('/api/events?upcoming=true&limit=100', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 5 * 60_000,
  })
  // Accurate today/next-7-day counts (not derived from the capped list above,
  // which under-reports past 100 upcoming events).
  const eventBadgeStatsQ = useQuery<{ todayCount: number; next7dCount: number }>({
    queryKey: ['events', 'badge-stats'],
    queryFn: () => fetch('/api/events/badge-stats', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 5 * 60_000,
  })

  const projects = projectsQ.data?.projects ?? []
  const activeProjects = projects.filter((p) => !p.archivedAt)
  const openTasksCount = openTasksQ.data?.total ?? 0
  const openBugs = openBugsQ.data?.total ?? 0
  const myTasks = myTasksQ.data?.tasks ?? []
  const activeMine = myTasks.filter((t) => t.status !== 'CLOSED')

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const todayCutoff = endOfToday.getTime()

  const overdue = activeMine
    .filter((t) => t.dueAt && new Date(t.dueAt).getTime() <= todayCutoff)
    .sort((a, b) => +new Date(a.dueAt as string) - +new Date(b.dueAt as string))

  const dueSoon = activeMine
    .filter((t) => {
      if (!t.dueAt) return false
      const due = new Date(t.dueAt).getTime()
      return due > todayCutoff && due <= now + 7 * dayMs
    })
    .sort((a, b) => +new Date(a.dueAt as string) - +new Date(b.dueAt as string))

  const ghost = activeMine
    .filter((t) => t.status === 'IN_PROGRESS' && new Date(t.updatedAt).getTime() < now - 3 * dayMs)
    .sort((a, b) => +new Date(a.updatedAt) - +new Date(b.updatedAt))

  const weekAgo = now - 7 * dayMs
  const closedThisWeek = myTasks.filter((t) => t.closedAt && new Date(t.closedAt).getTime() > weekAgo)
  const bugsAssignedThisWeek = myTasks.filter((t) => t.kind === 'BUG' && new Date(t.createdAt).getTime() > weekAgo)
  const inProgressCount = activeMine.filter((t) => t.status === 'IN_PROGRESS').length

  const notifs = notifsQ.data?.notifications ?? []
  const upcomingEvents = upcomingEventsQ.data?.events ?? []
  const todayKey = new Date().toISOString().slice(0, 10)
  const weekKey = new Date(Date.now() + 7 * dayMs).toISOString().slice(0, 10)
  // Item lists for rendering — safe from the capped fetch since events are
  // ordered by startsAt asc and only the first few are ever shown.
  const eventsToday = upcomingEvents.filter((e) => e.startsAt.slice(0, 10) === todayKey)
  const eventsThisWeek = upcomingEvents.filter((e) => {
    const k = e.startsAt.slice(0, 10)
    return k > todayKey && k <= weekKey
  })
  // Accurate counts for the badge number — read from the server aggregate, not
  // the arrays above (which under-report past the 100-row cap).
  const eventsTodayCount = eventBadgeStatsQ.data?.todayCount ?? eventsToday.length
  const eventsThisWeekCount = eventBadgeStatsQ.data
    ? Math.max(0, eventBadgeStatsQ.data.next7dCount - eventBadgeStatsQ.data.todayCount)
    : eventsThisWeek.length

  return {
    myTasksQ,
    notifsQ,
    upcomingEventsQ,
    activeProjects,
    openTasksCount,
    openBugs,
    myTasks,
    activeMine,
    overdue,
    dueSoon,
    ghost,
    closedThisWeek,
    bugsAssignedThisWeek,
    inProgressCount,
    notifs,
    upcomingEvents,
    eventsToday,
    eventsThisWeek,
    eventsTodayCount,
    eventsThisWeekCount,
    now,
    dayMs,
  }
}
