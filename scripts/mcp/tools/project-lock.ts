import { z } from 'zod'
import { setSetting } from '../../../src/lib/app-settings'
import { prisma } from '../../../src/lib/db'
import { canDecideLockedProject, canReadProject } from '../../../src/lib/project-access'
import {
  computeLockState,
  DEFAULT_LOCK_GRACE_DAYS,
  escalateAfterDays,
  getLockGraceDays,
  LOCK_GRACE_SETTING_KEY,
} from '../../../src/lib/project-lock'
import { recipientsForStage, runProjectLockSweep } from '../../../src/lib/project-lock.sweep'
import {
  findLockedProject,
  GUARDED_MODELS,
  isGuardedWrite,
  LOCK_PROJECT_SELECT,
  WRITE_OPS,
} from '../../../src/lib/prisma-project-lock'
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

    server.registerTool(
      'project_lock_write_guard',
      {
        title: 'Inspect the data-layer overdue-lock write guard',
        description:
          'Jawab: apakah guard di Prisma client (src/lib/prisma-project-lock.ts) akan menolak sebuah write. Tanpa argumen: daftar model + operasi yang dijaga. Dengan projectId: stage lock project itu dan apakah write ditolak. Read-only: tidak menulis apa pun. Pengecualian yang tidak terlihat di sini: actor system admin dan scope withLockBypass.',
        inputSchema: {
          projectId: z.string().optional().describe('Project yang diuji; kosong = hanya tampilkan daftar model dijaga'),
          model: z
            .string()
            .optional()
            .describe('Nama model Prisma, mis. "taskComment" atau "Task"; kosong = tidak cek per-model'),
          operation: z.string().default('update').describe('Operasi Prisma, mis. create/update/deleteMany'),
        },
      },
      async ({ projectId, model, operation }) => {
        const guardedModels = Object.fromEntries(
          Object.entries(GUARDED_MODELS).map(([key, spec]) => [
            key,
            {
              via: spec.parent ? `${spec.field} → ${spec.parent}.projectId` : spec.field,
              operations: [...(spec.ops ?? WRITE_OPS)],
            },
          ]),
        )
        // Same resolver the extension uses, so this report cannot drift from
        // the guard it describes.
        const locked = projectId
          ? await findLockedProject(
              (ids) => prisma.project.findMany({ where: { id: { in: ids } }, select: LOCK_PROJECT_SELECT }),
              [projectId],
            )
          : null
        const guarded = model ? isGuardedWrite(model, operation) : null
        return jsonText({
          guardedModels,
          exemptions: ['actor system admin (recordLockActor)', 'scope withLockBypass'],
          query: projectId || model ? { projectId: projectId ?? null, model: model ?? null, operation } : null,
          projectLocked: projectId ? locked !== null : null,
          lock: locked,
          modelGuarded: guarded,
          wouldBlock: projectId && model ? guarded === true && locked !== null : null,
        })
      },
    )

    server.registerTool(
      'project_lock_read_access',
      {
        title: 'Explain a project read decision for one user',
        description:
          'Untuk satu project + satu user: tampilkan stage lock, peran asli (raw) user di project, peran efektif (turun jadi VIEWER saat terkunci), dan hasil pembacaan — FULL (payload penuh), LOCK_SCREEN (payload minimal khusus OWNER di project terkunci; PM tidak termasuk), atau DENIED_403/DENIED_404. Juga melaporkan apakah sub-resource (task, milestone, phase, tag, retro, github) boleh dibaca. Read-only: memanggil gate canReadProject yang sama dengan API, jadi hasilnya tidak bisa melenceng dari behavior asli.',
        inputSchema: {
          projectId: z.string().describe('ID project yang diperiksa'),
          userEmail: z.string().email().describe('Email user yang hendak membaca project'),
        },
      },
      async ({ projectId, userEmail }) => {
        const user = await prisma.user.findUnique({
          where: { email: userEmail },
          select: { id: true, role: true, blocked: true },
        })
        if (!user) return jsonText({ error: `User ${userEmail} tidak ditemukan` })

        const auth = { userId: user.id, role: user.role }
        // Two calls on purpose: the detail route opts into the OWNER carve-out,
        // every sub-resource route does not — that difference IS the behavior.
        const detail = await canReadProject(projectId, auth, { allowLockedDecider: true })
        const sub = await canReadProject(projectId, auth)
        if (detail.status === 404) return jsonText({ error: `Project ${projectId} tidak ditemukan` })

        return jsonText({
          projectId,
          projectName: detail.project?.name ?? null,
          user: { email: userEmail, systemRole: user.role, blocked: user.blocked },
          lock: detail.lock,
          rawRole: detail.rawRole,
          effectiveRole: detail.membership?.role ?? null,
          projectDetailRead: detail.ok ? (detail.lockedView ? 'LOCK_SCREEN' : 'FULL') : `DENIED_${detail.status}`,
          subResourceRead: sub.ok ? 'ALLOWED' : `DENIED_${sub.status}`,
          // Same predicate the API uses, so this can't drift from the carve-out.
          canDecide: canDecideLockedProject(auth, detail.rawRole ? { role: detail.rawRole } : null),
        })
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
