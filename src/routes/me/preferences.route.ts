import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireAuth } from '../../lib/route-helpers'

type PMTab = 'overview' | 'projects' | 'tasks' | 'activity' | 'team'
type TaskDefaultFilter = 'mine' | 'all' | 'priority'
type UserPreferences = {
  notifyTaskAssigned: boolean
  notifyTaskStatusChanged: boolean
  notifyMentioned: boolean
  notifyProjectDeadline: boolean
  pmDefaultTab: PMTab
  tasksDefaultFilter: TaskDefaultFilter
  tableDensity: 'compact' | 'comfortable'
}

function defaultPreferences(): UserPreferences {
  return {
    notifyTaskAssigned: true,
    notifyTaskStatusChanged: true,
    notifyMentioned: true,
    notifyProjectDeadline: true,
    pmDefaultTab: 'overview',
    tasksDefaultFilter: 'mine',
    tableDensity: 'comfortable',
  }
}

function sanitizePreferences(input: Record<string, unknown>): UserPreferences {
  const base = defaultPreferences()
  const pmTabs: PMTab[] = ['overview', 'projects', 'tasks', 'activity', 'team']
  const filters: TaskDefaultFilter[] = ['mine', 'all', 'priority']
  return {
    notifyTaskAssigned:
      typeof input.notifyTaskAssigned === 'boolean' ? input.notifyTaskAssigned : base.notifyTaskAssigned,
    notifyTaskStatusChanged:
      typeof input.notifyTaskStatusChanged === 'boolean' ? input.notifyTaskStatusChanged : base.notifyTaskStatusChanged,
    notifyMentioned: typeof input.notifyMentioned === 'boolean' ? input.notifyMentioned : base.notifyMentioned,
    notifyProjectDeadline:
      typeof input.notifyProjectDeadline === 'boolean' ? input.notifyProjectDeadline : base.notifyProjectDeadline,
    pmDefaultTab: pmTabs.includes(input.pmDefaultTab as PMTab) ? (input.pmDefaultTab as PMTab) : base.pmDefaultTab,
    tasksDefaultFilter: filters.includes(input.tasksDefaultFilter as TaskDefaultFilter)
      ? (input.tasksDefaultFilter as TaskDefaultFilter)
      : base.tasksDefaultFilter,
    tableDensity: input.tableDensity === 'compact' ? 'compact' : 'comfortable',
  }
}

export function mePreferencesRoutes() {
  return new Elysia()

    .get('/api/me/preferences', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { preferences: true },
      })
      return { preferences: user?.preferences ?? defaultPreferences() }
    })

    .put('/api/me/preferences', async ({ request, body, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const incoming = (body ?? {}) as Record<string, unknown>
      const merged = sanitizePreferences(incoming)
      await prisma.user.update({
        where: { id: auth.userId },
        data: { preferences: merged },
      })
      return { preferences: merged }
    })
}
