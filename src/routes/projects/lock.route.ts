import Elysia from 'elysia'
import { prisma } from '../../lib/db'
import { createNotification } from '../../lib/notifications'
import { withLockBypass } from '../../lib/prisma-project-lock'
import { resolveLockState } from '../../lib/project-lock'
import { getIp, isSystemAdmin, requireAuth, requireProjectMemberRaw } from '../../lib/route-helpers'
import { audit } from './shared'

const DECISION_DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000
const MANAGER_ROLES = ['OWNER', 'PM']

export function projectLockRoutes() {
  return new Elysia().post('/api/projects/:id/request-decision', async ({ request, params, set }) => {
    const auth = await requireAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        ownerId: true,
        endsAt: true,
        status: true,
        archivedAt: true,
        members: { select: { userId: true, role: true } },
      },
    })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }

    // Raw role on purpose: yang menekan tombol ini justru anggota yang sedang
    // diblokir lock, jadi role efektif (VIEWER saat locked) bukan yang dites.
    const membership = await requireProjectMemberRaw(params.id, auth.userId)
    if (!membership && !isSystemAdmin(auth.role)) {
      set.status = 403
      return { error: 'Bukan anggota project ini' }
    }

    const lock = await resolveLockState(project)
    if (!lock.locked) {
      set.status = 400
      return { error: 'Project belum terkunci, tidak perlu meminta keputusan' }
    }

    const already = await prisma.notification.findFirst({
      where: {
        actorId: auth.userId,
        projectId: project.id,
        kind: 'PROJECT_DECISION_REQUESTED',
        createdAt: { gt: new Date(Date.now() - DECISION_DEDUP_WINDOW_MS) },
      },
      select: { id: true },
    })
    if (already) return { ok: true, deduped: true, notified: 0 }

    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, blocked: false },
      select: { id: true },
    })
    const recipients = new Set<string>([project.ownerId, ...admins.map((a) => a.id)])
    for (const m of project.members) if (MANAGER_ROLES.includes(m.role)) recipients.add(m.userId)
    // createNotification membuang notifikasi ke diri sendiri; buang di sini juga
    // supaya `notified` mencerminkan jumlah yang benar-benar terkirim.
    recipients.delete(auth.userId)

    const title = `Permintaan keputusan untuk "${project.name}"`
    const body = `Project terkunci karena terlambat ${lock.overdueDays} hari. Anggota meminta keputusan: perpanjang deadline, tandai selesai, atau batalkan project.`
    // Bypass sanctioned: asking for a decision is an exit from the lock, and it
    // runs *because* the project is locked. Notification is outside the guarded
    // model set today, so this is belt-and-braces — it keeps the escape hatch
    // working if that ever changes.
    await withLockBypass(async () => {
      for (const recipientId of recipients) {
        await createNotification({
          recipientId,
          actorId: auth.userId,
          kind: 'PROJECT_DECISION_REQUESTED',
          projectId: project.id,
          title,
          body,
        })
      }
    })

    audit(
      auth.userId,
      'PROJECT_DECISION_REQUESTED',
      `${project.id} overdueDays=${lock.overdueDays} notified=${recipients.size}`,
      getIp(request),
    )
    return { ok: true, deduped: false, notified: recipients.size }
  })
}
