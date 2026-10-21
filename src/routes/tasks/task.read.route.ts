import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import {
  canReadProject,
  computeActualHours,
  computeProgressPercent,
  isSystemAdmin,
  requireAuth,
} from '../../lib/route-helpers'

export function taskReadRoute() {
  return new Elysia().get('/api/tasks/:id', async ({ request, params, set }) => {
    const auth = await requireAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
        assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
        comments: {
          include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } },
          orderBy: { createdAt: 'asc' },
        },
        evidence: { orderBy: { createdAt: 'asc' } },
        tags: { include: { tag: true } },
        blockedBy: { include: { blockedBy: { select: { id: true, title: true, status: true, kind: true } } } },
        blocks: { include: { task: { select: { id: true, title: true, status: true, kind: true } } } },
        checklist: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        statusChanges: {
          include: { author: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!task) {
      set.status = 404
      return { error: 'Task not found' }
    }
    // canReadProject, not requireProjectMember: a locked project reports its
    // members as VIEWER, which is non-null, so the old membership check let a
    // member read every task of a project whose detail screen now denies them.
    const access = await canReadProject(task.projectId, auth)
    if (!access.ok) {
      set.status = access.status!
      return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
    }
    if (!access.membership && !isSystemAdmin(auth.role)) {
      set.status = 403
      return { error: 'Not a project member' }
    }
    const actualHours = computeActualHours(task)
    const progressPercent = computeProgressPercent(task)
    return { task: { ...task, actualHours, progressPercent } }
  })
}
