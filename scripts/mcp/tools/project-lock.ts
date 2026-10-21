import { z } from 'zod'
import { setSetting } from '../../../src/lib/app-settings'
import { prisma } from '../../../src/lib/db'
import {
  computeLockState,
  DEFAULT_LOCK_GRACE_DAYS,
  escalateAfterDays,
  getLockGraceDays,
  LOCK_GRACE_SETTING_KEY,
} from '../../../src/lib/project-lock'
import { recipientsForStage, runProjectLockSweep } from '../../../src/lib/project-lock.sweep'
import { jsonText, type ToolModule } from './shared'

export const projectLockReadonly: ToolModule = {
  name: 'project-lock-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'project_lock_states',
      {
        title: 'Inspect project overdue-lock states',
        description:
          'Tampilkan stage lock (EXEMPT/ON_TIME/DUE_SOON/OVERDUE/ESCALATED/LOCKED) tiap project ACTIVE non-archived beserta overdueDays, lockAt, dan jumlah penerima notifikasi per stage. Read-only: tidak mengirim notifikasi.',
        inputSchema: {
          stage: z
            .enum(['ALL', 'DUE_SOON', 'OVERDUE', 'ESCALATED', 'LOCKED'])
            .default('ALL')
            .describe('Filter hasil ke satu stage saja'),
        },
      },
      async ({ stage }) => {
        const graceDays = await getLockGraceDays()
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
          orderBy: { endsAt: 'asc' },
        })
        const admins = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, blocked: false },
          select: { id: true },
        })
        const adminIds = admins.map((a) => a.id)
        const rows = projects
          .map((p) => {
            const lock = computeLockState(p, graceDays)
            return {
              projectId: p.id,
              name: p.name,
              stage: lock.stage,
              overdueDays: lock.overdueDays,
              lockAt: lock.lockAt?.toISOString() ?? null,
              recipientCount: recipientsForStage(p, lock.stage, adminIds).length,
            }
          })
          .filter((r) => stage === 'ALL' || r.stage === stage)
        return jsonText({ graceDays, total: rows.length, projects: rows })
      },
    )
  },
}

export const projectLockAdmin: ToolModule = {
  name: 'project-lock-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'project_lock_sweep',
      {
        title: 'Run the overdue-lock escalation sweep',
        description:
          'Jalankan rantai eskalasi overdue lock sekali (normalnya tiap jam oleh server). Mengirim notifikasi PROJECT_DUE_SOON/OVERDUE/LOCK_WARNING/LOCKED dengan dedup 24 jam per (penerima, project, kind). Mengembalikan jumlah notifikasi per stage.',
        inputSchema: {},
      },
      async () => jsonText({ ok: true, sent: await runProjectLockSweep() }),
    )

    server.registerTool(
      'project_lock_set_grace',
      {
        title: 'Atur masa tenggang kunci overdue',
        description: `Set setting ${LOCK_GRACE_SETTING_KEY} (default ${DEFAULT_LOCK_GRACE_DAYS}): berapa hari setelah deadline lewat sebelum project jadi read-only. 0 = terkunci begitu deadline lewat. Cache 60s di-invalidate otomatis. Mengembalikan project mana yang langsung terkunci oleh nilai baru. Jalan keluar dari kunci tetap lewat project_extend atau project_update (status COMPLETED/CANCELLED).`,
        inputSchema: {
          graceDays: z.number().int().min(0).max(365),
          actorEmail: z.string().email().optional().describe('Email user untuk kolom updatedBy; opsional'),
        },
      },
      async ({ graceDays, actorEmail }) => {
        const actor = actorEmail
          ? await prisma.user.findUnique({ where: { email: actorEmail }, select: { id: true } })
          : null
        await setSetting(LOCK_GRACE_SETTING_KEY, String(graceDays), actor?.id)

        const projects = await prisma.project.findMany({
          where: { status: 'ACTIVE', archivedAt: null, endsAt: { not: null } },
          select: { id: true, name: true, status: true, endsAt: true, archivedAt: true },
        })
        const locked = projects
          .map((p) => ({ projectId: p.id, name: p.name, ...computeLockState(p, graceDays) }))
          .filter((p) => p.locked)

        return jsonText({
          ok: true,
          graceDays,
          escalateAfterDays: escalateAfterDays(graceDays),
          lockedNow: locked.length,
          projects: locked,
        })
      },
    )
  },
}
