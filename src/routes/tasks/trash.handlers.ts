import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getIp, isSystemAdmin, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { buildTrashWhere, checkRestorePermission, checkSingleDeletePermission, computeBulkDeleteSplit } from './trash.helpers'

type Ctx = { request: Request; set: { status?: number | string } }
type CtxWithParams = Ctx & { params: { id: string } }
type CtxWithQuery = Ctx & { query: Record<string, string> }

export async function deleteTaskHandler({ request, params, set }: CtxWithParams) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const current = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null } })
  if (!current) { set.status = 404; return { error: 'Task not found' } }
  const canDelete = await checkSingleDeletePermission(auth, current)
  if (!canDelete) {
    set.status = 403
    return { error: 'Only the reporter or project OWNER/PM can delete tasks' }
  }
  const body = (await request.json().catch(() => ({}))) as { reason?: string }
  if (!body.reason || body.reason.trim().length < 3) {
    set.status = 400
    return { error: 'Alasan penghapusan wajib diisi (min 3 karakter)' }
  }
  await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), deletedById: auth.userId, deleteReason: body.reason.trim() },
  })
  writeAuditLog(auth.userId, 'TASK_DELETED', `#${current.id} "${current.title}" — ${body.reason.trim()}`, getIp(request))
  appLog('info', `Task soft-deleted: #${current.id} by ${auth.userId}`)
  emitInvalidate('tasks', { projectId: current.projectId })
  return { ok: true }
}

export async function bulkDeleteTasksHandler({ request, set }: Ctx) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const body = (await request.json().catch(() => null)) as { ids?: unknown; reason?: string } | null
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    set.status = 400
    return { error: 'ids[] required' }
  }
  if (!body.reason || body.reason.trim().length < 3) {
    set.status = 400
    return { error: 'Alasan penghapusan wajib diisi (min 3 karakter)' }
  }
  const ids = body.ids.filter((v): v is string => typeof v === 'string').slice(0, 500)
  if (ids.length === 0) { set.status = 400; return { error: 'ids[] must contain non-empty strings' } }
  const candidates = await prisma.task.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, projectId: true, reporterId: true, title: true },
  })
  if (candidates.length === 0) return { deleted: 0, denied: 0, deniedIds: [] }
  const { allowedIds, deniedIds } = await computeBulkDeleteSplit(auth, candidates)
  if (allowedIds.length > 0) {
    const now = new Date()
    await prisma.task.updateMany({
      where: { id: { in: allowedIds } },
      data: { deletedAt: now, deletedById: auth.userId, deleteReason: body.reason.trim() },
    })
    writeAuditLog(auth.userId, 'TASK_DELETED', `bulk: ${allowedIds.length} tasks — ${body.reason.trim()}`, getIp(request))
    appLog('info', `Bulk soft-delete: ${allowedIds.length} tasks by ${auth.userId}`)
    emitInvalidate('tasks')
  }
  return { deleted: allowedIds.length, denied: deniedIds.length, deniedIds }
}

export async function listTrashHandler({ request, query, set }: CtxWithQuery) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const isAdmin = isSystemAdmin(auth.role)
  const where = await buildTrashWhere(auth, isAdmin, query.projectId)
  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, name: true } },
      reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
      assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
      deletedBy: { select: { id: true, name: true, email: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { deletedAt: 'desc' },
    take: Math.min(Number(query.limit) || 100, 500),
  })
  return { tasks }
}

export async function restoreTaskHandler({ request, params, set }: CtxWithParams) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const current = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null } })
  if (!current?.deletedAt) { set.status = 404; return { error: 'Task not found in trash' } }
  const canRestore = await checkRestorePermission(auth, current)
  if (!canRestore) {
    set.status = 403
    return { error: 'Hanya reporter atau OWNER/PM yang bisa restore' }
  }
  await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: null, deletedById: null, deleteReason: null },
  })
  writeAuditLog(auth.userId, 'TASK_RESTORED', `#${current.id} "${current.title}"`, getIp(request))
  appLog('info', `Task restored: #${current.id} by ${auth.userId}`)
  emitInvalidate('tasks', { projectId: current.projectId })
  return { ok: true }
}

export async function purgeTaskHandler({ request, params, set }: CtxWithParams) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  if (!isSystemAdmin(auth.role)) { set.status = 403; return { error: 'ADMIN atau SUPER_ADMIN only' } }
  const current = await prisma.task.findUnique({ where: { id: params.id, deletedAt: null } })
  if (!current?.deletedAt) { set.status = 404; return { error: 'Task not found in trash' } }
  await prisma.task.delete({ where: { id: params.id } })
  writeAuditLog(auth.userId, 'TASK_PURGED', `#${current.id} "${current.title}"`, getIp(request))
  appLog('info', `Task permanently purged: #${current.id} by ${auth.userId}`)
  return { ok: true }
}
