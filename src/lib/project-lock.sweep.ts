// Rantai eskalasi overdue lock: due-soon → overdue → peringatan ke system admin
// → locked. Dijalankan saat startup lalu tiap jam oleh server entry. Dedup per
// (penerima, project, kind) dalam 24 jam supaya tick berikutnya tidak mengirim
// notifikasi yang sama berulang.
import type { NotificationKind } from '../../generated/prisma'
import { prisma } from './db'
import { createNotification } from './notifications.core'
import { computeLockState, getLockGraceDays, type LockStage, type LockState } from './project-lock'

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000
const MANAGER_ROLES = ['OWNER', 'PM']

export type SweepProject = {
  id: string
  name: string
  ownerId: string
  endsAt: Date | null
  status: string
  archivedAt: Date | null
  members: { userId: string; role: string }[]
}

const STAGE_KIND: Partial<Record<LockStage, NotificationKind>> = {
  DUE_SOON: 'PROJECT_DUE_SOON',
  OVERDUE: 'PROJECT_OVERDUE',
  ESCALATED: 'PROJECT_LOCK_WARNING',
  LOCKED: 'PROJECT_LOCKED',
}

const SWEEP_KINDS = Object.values(STAGE_KIND) as NotificationKind[]

export function stageKind(stage: LockStage): NotificationKind | null {
  return STAGE_KIND[stage] ?? null
}

// Pre-lock stage hanya menyasar yang berwenang memutuskan; ESCALATED menarik
// system admin sebagai eskalasi; LOCKED menyasar semua anggota karena mereka
// yang kena dampaknya.
export function recipientsForStage(
  project: Pick<SweepProject, 'ownerId' | 'members'>,
  stage: LockStage,
  systemAdminIds: string[],
): string[] {
  if (stageKind(stage) === null) return []
  const ids = new Set<string>([project.ownerId])
  for (const m of project.members) {
    if (stage === 'LOCKED' || MANAGER_ROLES.includes(m.role)) ids.add(m.userId)
  }
  if (stage === 'ESCALATED' || stage === 'LOCKED') for (const id of systemAdminIds) ids.add(id)
  return [...ids]
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function messageForStage(
  project: Pick<SweepProject, 'name'>,
  lock: LockState,
): { title: string; body: string } | null {
  const lockAt = lock.lockAt ? formatDay(lock.lockAt) : '-'
  switch (lock.stage) {
    case 'DUE_SOON': {
      const daysLeft = -lock.overdueDays
      return {
        title: `Deadline "${project.name}" tinggal ${daysLeft} hari`,
        body: `Deadline project jatuh dalam ${daysLeft} hari. Bila lewat ${lock.graceDays} hari tanpa keputusan, project otomatis read-only pada ${lockAt}.`,
      }
    }
    case 'OVERDUE':
      return {
        title: `"${project.name}" lewat deadline ${lock.overdueDays} hari`,
        body: `Project terlambat ${lock.overdueDays} hari. Project otomatis read-only pada ${lockAt}. Perpanjang deadline, atau tandai selesai/dibatalkan sebelum tanggal itu.`,
      }
    case 'ESCALATED':
      return {
        title: `Peringatan: "${project.name}" akan read-only dalam ${Math.max(0, lock.graceDays - lock.overdueDays)} hari`,
        body: `Project terlambat ${lock.overdueDays} hari dan belum ada keputusan. Pada ${lockAt} project otomatis read-only untuk seluruh anggota.`,
      }
    case 'LOCKED':
      return {
        title: `"${project.name}" read-only, terlambat ${lock.overdueDays} hari`,
        body: `Project terkunci sejak ${lockAt} dan tidak bisa diubah sampai ada keputusan: deadline diperpanjang, atau project ditandai selesai/dibatalkan.`,
      }
    default:
      return null
  }
}

export async function runProjectLockSweep(now: Date = new Date()): Promise<Record<string, number>> {
  const graceDays = await getLockGraceDays()
  const since = new Date(now.getTime() - DEDUP_WINDOW_MS)

  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE', archivedAt: null, endsAt: { not: null } },
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

  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, blocked: false },
    select: { id: true },
  })
  const systemAdminIds = admins.map((a) => a.id)

  // Satu query untuk seluruh dedup window, bukan satu per penerima: jumlah
  // penerima tumbuh dengan jumlah anggota x project.
  const recent = await prisma.notification.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, kind: { in: SWEEP_KINDS }, createdAt: { gt: since } },
    select: { recipientId: true, projectId: true, kind: true },
  })
  const alreadySent = new Set(recent.map((n) => `${n.recipientId}:${n.projectId}:${n.kind}`))

  const counts: Record<string, number> = { DUE_SOON: 0, OVERDUE: 0, ESCALATED: 0, LOCKED: 0 }

  for (const project of projects) {
    const lock = computeLockState(project, graceDays, now)
    const kind = stageKind(lock.stage)
    const message = messageForStage(project, lock)
    if (!kind || !message) continue
    for (const recipientId of recipientsForStage(project, lock.stage, systemAdminIds)) {
      if (alreadySent.has(`${recipientId}:${project.id}:${kind}`)) continue
      await createNotification({
        recipientId,
        kind,
        projectId: project.id,
        title: message.title,
        body: message.body,
      })
      counts[lock.stage] = (counts[lock.stage] ?? 0) + 1
    }
  }

  return counts
}
