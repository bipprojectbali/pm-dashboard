import Elysia from 'elysia'
import { prisma } from '../lib/db'
import { appLog } from '../lib/applog'
import { normalizeGithubRepo } from '../lib/github'
import { emitInvalidate } from '../lib/presence'
import { computeRetro, renderRetroMarkdown } from '../lib/retro'
import {
  requireAuth,
  requireProjectMember,
  canReadProject,
  canManageProject,
  canGrantProjectOwner,
  getIp,
  isSystemAdmin,
} from '../lib/route-helpers'

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

export function projectsRoutes() {
  return new Elysia()
    .get('/api/users', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const users = await prisma.user.findMany({
        where: { blocked: false },
        select: { id: true, name: true, email: true, role: true, image: true },
        orderBy: { name: 'asc' },
      })
      return { users }
    })

    .get('/api/projects', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const isAdmin = isSystemAdmin(auth.role)
      const scope = typeof query.scope === 'string' ? query.scope : 'visible'
      const projectInclude = {
        owner: { select: { id: true, name: true, email: true, image: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { members: true, tasks: true, milestones: true } },
      } as const
      const memberships = await prisma.projectMember.findMany({
        where: { userId: auth.userId },
        include: { project: { include: projectInclude } },
        orderBy: { joinedAt: 'desc' },
      })
      const roleByProject = new Map<string, 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'>()
      const joinedAtByProject = new Map<string, Date>()
      for (const m of memberships) {
        roleByProject.set(m.projectId, m.role)
        joinedAtByProject.set(m.projectId, m.joinedAt)
      }
      type ProjectRow = (typeof memberships)[number]['project']
      let projectRows: ProjectRow[]
      if (scope === 'mine') {
        projectRows = memberships.map((m) => m.project)
      } else if (isAdmin) {
        projectRows = await prisma.project.findMany({
          include: projectInclude,
          orderBy: { createdAt: 'desc' },
        })
      } else {
        projectRows = await prisma.project.findMany({
          where: {
            OR: [{ visibility: { in: ['INTERNAL', 'PUBLIC'] } }, { members: { some: { userId: auth.userId } } }],
          },
          include: projectInclude,
          orderBy: { createdAt: 'desc' },
        })
      }
      const projectIds = projectRows.map((p) => p.id)
      const grouped = projectIds.length
        ? await prisma.task.groupBy({
            by: ['projectId', 'status'],
            where: { projectId: { in: projectIds } },
            _count: { _all: true },
          })
        : []
      const statsByProject = new Map<string, Record<string, number>>()
      for (const g of grouped) {
        const row = statsByProject.get(g.projectId) ?? {}
        row[g.status] = g._count._all
        statsByProject.set(g.projectId, row)
      }
      const milestonesDone = projectIds.length
        ? await prisma.projectMilestone.groupBy({
            by: ['projectId'],
            where: { projectId: { in: projectIds }, completedAt: { not: null } },
            _count: { _all: true },
          })
        : []
      const doneByProject = new Map<string, number>(milestonesDone.map((m) => [m.projectId, m._count._all]))
      return {
        projects: projectRows.map((p) => {
          const s = statsByProject.get(p.id) ?? {}
          const myRole = roleByProject.get(p.id) ?? null
          return {
            ...p,
            myRole,
            joinedAt: joinedAtByProject.get(p.id) ?? null,
            canWrite: isAdmin || myRole != null,
            taskStats: {
              open: s.OPEN ?? 0,
              inProgress: s.IN_PROGRESS ?? 0,
              readyForQc: s.READY_FOR_QC ?? 0,
              reopened: s.REOPENED ?? 0,
              closed: s.CLOSED ?? 0,
              total:
                (s.OPEN ?? 0) + (s.IN_PROGRESS ?? 0) + (s.READY_FOR_QC ?? 0) + (s.REOPENED ?? 0) + (s.CLOSED ?? 0),
            },
            milestoneStats: {
              done: doneByProject.get(p.id) ?? 0,
              total: p._count.milestones,
            },
          }
        }),
      }
    })

    .post('/api/projects', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'ADMIN' && auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Only admins can create projects' }
      }
      const body = (await request.json()) as {
        name?: string
        description?: string
        status?: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
        priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
        visibility?: 'PRIVATE' | 'INTERNAL' | 'PUBLIC'
        startsAt?: string | null
        endsAt?: string | null
      }
      if (!body.name?.trim()) {
        set.status = 400
        return { error: 'name wajib diisi' }
      }
      const endsAt = body.endsAt ? new Date(body.endsAt) : null
      const project = await prisma.project.create({
        data: {
          name: body.name.trim(),
          description: body.description ?? null,
          ownerId: auth.userId,
          status: body.status ?? 'ACTIVE',
          priority: body.priority ?? 'MEDIUM',
          visibility: body.visibility ?? 'INTERNAL',
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          endsAt,
          originalEndAt: endsAt,
          members: { create: { userId: auth.userId, role: 'OWNER' } },
        },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true } },
          _count: { select: { members: true, tasks: true } },
        },
      })
      audit(auth.userId, 'PROJECT_CREATED', `${project.name} (${project.id})`, getIp(request))
      appLog('info', `Project created: ${project.name} by ${auth.email}`)
      emitInvalidate('projects')
      return { project }
    })

    .get('/api/projects/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const project = await prisma.project.findUnique({
        where: { id: params.id },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true } },
          members: {
            include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
            orderBy: { joinedAt: 'asc' },
          },
          _count: { select: { tasks: true, members: true, milestones: true } },
        },
      })
      if (!project) {
        set.status = 404
        return { error: 'Project not found' }
      }
      const membership = await requireProjectMember(params.id, auth.userId)
      const isAdmin = isSystemAdmin(auth.role)
      const isVisible =
        isAdmin || membership != null || project.visibility === 'INTERNAL' || project.visibility === 'PUBLIC'
      if (!isVisible) {
        set.status = 403
        return { error: 'Project not accessible' }
      }
      const grouped = await prisma.task.groupBy({
        by: ['status'],
        where: { projectId: params.id },
        _count: { _all: true },
      })
      const s: Record<string, number> = {}
      for (const g of grouped) s[g.status] = g._count._all
      const taskStats = {
        open: s.OPEN ?? 0,
        inProgress: s.IN_PROGRESS ?? 0,
        readyForQc: s.READY_FOR_QC ?? 0,
        reopened: s.REOPENED ?? 0,
        closed: s.CLOSED ?? 0,
        total: (s.OPEN ?? 0) + (s.IN_PROGRESS ?? 0) + (s.READY_FOR_QC ?? 0) + (s.REOPENED ?? 0) + (s.CLOSED ?? 0),
      }
      return {
        project: { ...project, taskStats },
        myRole: membership?.role ?? null,
        canWrite: isAdmin || membership != null,
      }
    })

    .patch('/api/projects/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can modify project' }
      }
      const body = (await request.json()) as {
        name?: string
        description?: string | null
        status?: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
        priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
        visibility?: 'PRIVATE' | 'INTERNAL' | 'PUBLIC'
        startsAt?: string | null
        endsAt?: string | null
        archived?: boolean
        githubRepo?: string | null
      }
      const existing = await prisma.project.findUnique({
        where: { id: params.id },
        select: { endsAt: true, originalEndAt: true },
      })
      if (!existing) {
        set.status = 404
        return { error: 'Project not found' }
      }
      const data: Record<string, unknown> = {}
      if (body.name !== undefined) data.name = body.name
      if (body.description !== undefined) data.description = body.description
      if (body.status !== undefined) data.status = body.status
      if (body.priority !== undefined) data.priority = body.priority
      if (body.visibility !== undefined) data.visibility = body.visibility
      if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null
      if (body.endsAt !== undefined) {
        const newEnd = body.endsAt ? new Date(body.endsAt) : null
        data.endsAt = newEnd
        if (existing.originalEndAt == null && newEnd != null) {
          data.originalEndAt = newEnd
        }
      }
      if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null
      if (body.githubRepo !== undefined) {
        if (body.githubRepo === null || body.githubRepo === '') {
          data.githubRepo = null
        } else {
          const normalized = normalizeGithubRepo(body.githubRepo)
          if (!normalized) {
            set.status = 400
            return { error: 'Invalid GitHub repo — use owner/repo or full URL' }
          }
          data.githubRepo = normalized
        }
      }
      try {
        const project = await prisma.project.update({ where: { id: params.id }, data })
        audit(auth.userId, 'PROJECT_UPDATED', `${project.id} ${Object.keys(data).join(',')}`, getIp(request))
        emitInvalidate('projects', { projectId: project.id })
        return { project }
      } catch (e) {
        const err = e as { code?: string }
        if (err.code === 'P2002') {
          set.status = 409
          return { error: 'This GitHub repo is already linked to another project' }
        }
        throw e
      }
    })

    .delete('/api/projects/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { role: true } })
      const membership = await requireProjectMember(params.id, auth.userId)
      const isOwner = membership?.role === 'OWNER'
      const isSuperAdmin = me?.role === 'SUPER_ADMIN'
      if (!isOwner && !isSuperAdmin) {
        set.status = 403
        return { error: 'Only the project OWNER or SUPER_ADMIN can delete a project' }
      }
      const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, name: true } })
      if (!project) {
        set.status = 404
        return { error: 'Project not found' }
      }
      await prisma.project.delete({ where: { id: params.id } })
      audit(auth.userId, 'PROJECT_DELETED', `${project.id} ${project.name}`, getIp(request))
      emitInvalidate('projects', { projectId: project.id })
      emitInvalidate('tasks', { projectId: project.id })
      return { ok: true }
    })

    .get('/api/projects/:id/github/summary', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const project = await prisma.project.findUnique({
        where: { id: params.id },
        select: { id: true, githubRepo: true },
      })
      if (!project) {
        set.status = 404
        return { error: 'Project not found' }
      }
      if (!project.githubRepo) {
        return { linked: false, repo: null }
      }
      const now = Date.now()
      const day = 24 * 3600 * 1000
      const last7 = new Date(now - 7 * day)
      const last30 = new Date(now - 30 * day)

      const [commits7, commits30, contributors, openPrs, lastEvent, recentEvents, allPushes] = await Promise.all([
        prisma.projectGithubEvent.count({
          where: { projectId: params.id, kind: 'PUSH_COMMIT', createdAt: { gte: last7 } },
        }),
        prisma.projectGithubEvent.count({
          where: { projectId: params.id, kind: 'PUSH_COMMIT', createdAt: { gte: last30 } },
        }),
        prisma.projectGithubEvent.groupBy({
          by: ['actorLogin'],
          where: { projectId: params.id, kind: 'PUSH_COMMIT', createdAt: { gte: last30 } },
          _count: { _all: true },
          orderBy: { _count: { actorLogin: 'desc' } },
          take: 8,
        }),
        prisma.projectGithubEvent.findMany({
          where: { projectId: params.id, kind: 'PR_OPENED' },
          select: { prNumber: true, title: true, url: true, actorLogin: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        prisma.projectGithubEvent.findFirst({
          where: { projectId: params.id, kind: 'PUSH_COMMIT' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, actorLogin: true },
        }),
        prisma.projectGithubEvent.findMany({
          where: { projectId: params.id },
          orderBy: { createdAt: 'desc' },
          take: 15,
          include: { matchedUser: { select: { id: true, name: true, email: true, image: true } } },
        }),
        prisma.projectGithubEvent.findMany({
          where: { projectId: params.id, kind: { in: ['PR_CLOSED', 'PR_MERGED'] } },
          select: { prNumber: true },
        }),
      ])

      const closedPrNums = new Set(allPushes.map((p) => p.prNumber).filter((n): n is number => n != null))
      const openPrList = openPrs.filter((p) => p.prNumber != null && !closedPrNums.has(p.prNumber))

      return {
        linked: true,
        repo: project.githubRepo,
        stats: {
          commits7d: commits7,
          commits30d: commits30,
          contributors30d: contributors.length,
          openPrs: openPrList.length,
          lastPushAt: lastEvent?.createdAt ?? null,
          lastPushBy: lastEvent?.actorLogin ?? null,
        },
        contributors: contributors.map((c) => ({ login: c.actorLogin, commits: c._count._all })),
        openPrs: openPrList.slice(0, 5),
        recent: recentEvents,
      }
    })

    .get('/api/projects/:id/github/feed', async ({ request, params, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) ?? '50', 10) || 50))
      const kindParam = typeof query.kind === 'string' ? query.kind.toUpperCase() : null
      const validKinds = ['PUSH_COMMIT', 'PR_OPENED', 'PR_CLOSED', 'PR_MERGED', 'PR_REVIEWED'] as const
      const kind = validKinds.includes(kindParam as (typeof validKinds)[number])
        ? (kindParam as (typeof validKinds)[number])
        : null
      const events = await prisma.projectGithubEvent.findMany({
        where: { projectId: params.id, ...(kind ? { kind } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { matchedUser: { select: { id: true, name: true, email: true, image: true } } },
      })
      return { events }
    })

    .get('/api/projects/:id/retro', async ({ request, params, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const now = Date.now()
      const defaultSince = new Date(now - 14 * 24 * 60 * 60 * 1000)
      const since = typeof query.since === 'string' ? new Date(query.since) : defaultSince
      const until = typeof query.until === 'string' ? new Date(query.until) : new Date(now)
      if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || until <= since) {
        set.status = 400
        return { error: 'Invalid since/until' }
      }
      const retro = await computeRetro({ projectId: params.id, since, until })
      if (!retro) {
        set.status = 404
        return { error: 'Project not found' }
      }
      if (query.format === 'md' || query.format === 'markdown') {
        set.headers['content-type'] = 'text/markdown; charset=utf-8'
        return renderRetroMarkdown(retro)
      }
      return retro
    })

    .post('/api/projects/:id/members', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can add members' }
      }
      const body = (await request.json()) as { userId?: string; role?: string }
      if (!body.userId) {
        set.status = 400
        return { error: 'userId wajib diisi' }
      }
      const role = (body.role ?? 'MEMBER') as 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'
      if (role === 'OWNER' && !canGrantProjectOwner(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER or SUPER_ADMIN can grant OWNER role' }
      }
      const existingMember = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: params.id, userId: body.userId } },
      })
      if (existingMember) {
        set.status = 409
        return { error: 'User is already a member of this project' }
      }
      const member = await prisma.projectMember.create({
        data: { projectId: params.id, userId: body.userId, role },
        include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
      })
      audit(auth.userId, 'PROJECT_MEMBER_ADDED', `${params.id} ← ${body.userId} (${role})`, getIp(request))
      emitInvalidate('projects', { projectId: params.id })
      return { member }
    })

    .patch('/api/projects/:id/members/:userId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can change member role' }
      }
      const body = (await request.json()) as { role?: string }
      const role = body.role as 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER' | undefined
      if (!role || !['OWNER', 'PM', 'MEMBER', 'VIEWER'].includes(role)) {
        set.status = 400
        return { error: 'role wajib diisi (OWNER|PM|MEMBER|VIEWER)' }
      }
      if (role === 'OWNER' && !canGrantProjectOwner(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER or SUPER_ADMIN can grant OWNER role' }
      }
      const project = await prisma.project.findUnique({ where: { id: params.id }, select: { ownerId: true } })
      if (project?.ownerId === params.userId && role !== 'OWNER') {
        set.status = 400
        return { error: 'Cannot demote the project owner' }
      }
      const updated = await prisma.projectMember.update({
        where: { projectId_userId: { projectId: params.id, userId: params.userId } },
        data: { role },
        include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
      })
      audit(auth.userId, 'PROJECT_MEMBER_ROLE_CHANGED', `${params.id} ${params.userId} → ${role}`, getIp(request))
      emitInvalidate('projects', { projectId: params.id })
      return { member: updated }
    })

    .delete('/api/projects/:id/members/:userId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can remove members' }
      }
      const project = await prisma.project.findUnique({ where: { id: params.id }, select: { ownerId: true } })
      if (project?.ownerId === params.userId) {
        set.status = 400
        return { error: 'Cannot remove the project owner' }
      }
      await prisma.projectMember.delete({
        where: { projectId_userId: { projectId: params.id, userId: params.userId } },
      })
      audit(auth.userId, 'PROJECT_MEMBER_REMOVED', `${params.id} ← ${params.userId}`, getIp(request))
      emitInvalidate('projects', { projectId: params.id })
      return { ok: true }
    })

    .post('/api/projects/:id/extend', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can extend deadline' }
      }
      const body = (await request.json()) as { newEndAt?: string; reason?: string }
      if (!body.newEndAt) {
        set.status = 400
        return { error: 'newEndAt wajib diisi' }
      }
      const newEnd = new Date(body.newEndAt)
      if (Number.isNaN(newEnd.getTime())) {
        set.status = 400
        return { error: 'newEndAt tidak valid' }
      }
      const existing = await prisma.project.findUnique({
        where: { id: params.id },
        select: { endsAt: true, originalEndAt: true, startsAt: true },
      })
      if (!existing) {
        set.status = 404
        return { error: 'Project not found' }
      }
      if (existing.startsAt && newEnd < existing.startsAt) {
        set.status = 400
        return { error: 'newEndAt must be after startsAt' }
      }
      if (existing.endsAt && newEnd.getTime() === existing.endsAt.getTime()) {
        set.status = 400
        return { error: 'newEndAt sama dengan deadline saat ini' }
      }
      const [extension, project] = await prisma.$transaction([
        prisma.projectExtension.create({
          data: {
            projectId: params.id,
            extendedById: auth.userId,
            previousEndAt: existing.endsAt,
            newEndAt: newEnd,
            reason: body.reason?.trim() || null,
          },
          include: { extendedBy: { select: { id: true, name: true, email: true, image: true } } },
        }),
        prisma.project.update({
          where: { id: params.id },
          data: {
            endsAt: newEnd,
            originalEndAt: existing.originalEndAt ?? existing.endsAt ?? newEnd,
          },
        }),
      ])
      audit(
        auth.userId,
        'PROJECT_EXTENDED',
        `${params.id} ${existing.endsAt?.toISOString() ?? 'null'} → ${newEnd.toISOString()}${body.reason ? ` (${body.reason})` : ''}`,
        getIp(request),
      )
      emitInvalidate('projects', { projectId: params.id })
      return { extension, project }
    })

    .get('/api/projects/:id/extensions', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const extensions = await prisma.projectExtension.findMany({
        where: { projectId: params.id },
        include: { extendedBy: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return { extensions }
    })

    .get('/api/milestones', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const memberships = await prisma.projectMember.findMany({
        where: { userId: auth.userId },
        select: { projectId: true },
      })
      const projectIds = memberships.map((m) => m.projectId)
      if (projectIds.length === 0) return { milestones: [] }
      const milestones = await prisma.projectMilestone.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: [{ order: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      })
      return { milestones }
    })

    .get('/api/projects/:id/milestones', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const milestones = await prisma.projectMilestone.findMany({
        where: { projectId: params.id },
        orderBy: [{ order: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      })
      return { milestones }
    })

    .post('/api/projects/:id/milestones', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can create milestones' }
      }
      const body = (await request.json()) as {
        title?: string
        description?: string | null
        dueAt?: string | null
      }
      if (!body.title?.trim()) {
        set.status = 400
        return { error: 'title wajib diisi' }
      }
      const last = await prisma.projectMilestone.findFirst({
        where: { projectId: params.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const milestone = await prisma.projectMilestone.create({
        data: {
          projectId: params.id,
          title: body.title.trim(),
          description: body.description?.trim() || null,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          order: (last?.order ?? -1) + 1,
        },
      })
      audit(auth.userId, 'MILESTONE_CREATED', `${params.id} ${milestone.title}`, getIp(request))
      emitInvalidate('milestones', { projectId: params.id })
      return { milestone }
    })

    .patch('/api/milestones/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const existing = await prisma.projectMilestone.findUnique({
        where: { id: params.id },
        select: { projectId: true, completedAt: true },
      })
      if (!existing) {
        set.status = 404
        return { error: 'Milestone not found' }
      }
      const membership = await requireProjectMember(existing.projectId, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can modify milestones' }
      }
      const body = (await request.json()) as {
        title?: string
        description?: string | null
        dueAt?: string | null
        completed?: boolean
        order?: number
      }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title.trim()
      if (body.description !== undefined) data.description = body.description?.trim() || null
      if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null
      if (body.completed !== undefined) data.completedAt = body.completed ? new Date() : null
      if (body.order !== undefined) data.order = body.order
      const milestone = await prisma.projectMilestone.update({ where: { id: params.id }, data })
      audit(
        auth.userId,
        'MILESTONE_UPDATED',
        `${existing.projectId}/${params.id} ${Object.keys(data).join(',')}`,
        getIp(request),
      )
      emitInvalidate('milestones', { projectId: existing.projectId })
      return { milestone }
    })

    .delete('/api/milestones/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const existing = await prisma.projectMilestone.findUnique({
        where: { id: params.id },
        select: { projectId: true, title: true },
      })
      if (!existing) {
        set.status = 404
        return { error: 'Milestone not found' }
      }
      const membership = await requireProjectMember(existing.projectId, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can delete milestones' }
      }
      await prisma.projectMilestone.delete({ where: { id: params.id } })
      audit(auth.userId, 'MILESTONE_DELETED', `${existing.projectId}/${params.id} ${existing.title}`, getIp(request))
      emitInvalidate('milestones', { projectId: existing.projectId })
      return { ok: true }
    })
}
