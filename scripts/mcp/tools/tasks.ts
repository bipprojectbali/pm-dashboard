import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { getPermissionRule, meetsMinProjectRole } from '../../../src/lib/permission-config'
import { isSystemAdmin, requireProjectMember } from '../../../src/lib/project-access'
import { getAllowedTaskTransitions } from '../../../src/lib/task-lifecycle'
import { jsonText, type ToolModule } from './shared'
import { resolveUserEmail } from './tasks.helpers'
import { registerTaskWriteTools } from './tasks.write'
import { registerChecklistTools, registerDependencyTools } from './tasks.checklist'
import { registerBulkTools } from './tasks.bulk'

export const tasksReadonly: ToolModule = {
  name: 'tasks-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'task_list',
      {
        title: 'List tasks',
        description: 'List tasks across projects with optional filters.',
        inputSchema: {
          projectId: z.string().optional(),
          status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED', 'ALL']).default('ALL'),
          kind: z.enum(['TASK', 'BUG', 'QC', 'TICKET', 'IDEA', 'ALL']).default('ALL'),
          assigneeEmail: z.string().email().optional(),
          limit: z.number().int().min(1).max(500).default(100),
        },
      },
      async ({ projectId, status, kind, assigneeEmail, limit }) => {
        const where: Record<string, unknown> = {}
        if (projectId) where.projectId = projectId
        if (status !== 'ALL') where.status = status
        if (kind !== 'ALL') where.kind = kind
        if (assigneeEmail) {
          const u = await resolveUserEmail(assigneeEmail)
          if (!u) return jsonText({ error: `User not found: ${assigneeEmail}` })
          where.assigneeId = u.id
        }
        const tasks = await prisma.task.findMany({
          where,
          include: {
            project: { select: { id: true, name: true } },
            reporter: { select: { id: true, name: true, email: true } },
            assignee: { select: { id: true, name: true, email: true } },
            _count: { select: { comments: true, evidence: true } },
          },
          orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
          take: limit,
        })
        return jsonText({ count: tasks.length, tasks })
      },
    )

    server.registerTool(
      'task_get',
      {
        title: 'Get task detail',
        description: 'Fetch full task including comments and evidence.',
        inputSchema: { taskId: z.string() },
      },
      async ({ taskId }) => {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            project: { select: { id: true, name: true } },
            reporter: { select: { id: true, name: true, email: true } },
            assignee: { select: { id: true, name: true, email: true } },
            comments: {
              include: { author: { select: { id: true, name: true, email: true } } },
              orderBy: { createdAt: 'asc' },
            },
            evidence: { orderBy: { createdAt: 'asc' } },
          },
        })
        if (!task) return jsonText({ error: 'Task not found' })
        return jsonText({ task })
      },
    )

    server.registerTool(
      'task_reorder_authz_check',
      {
        title: 'Cek otorisasi batch reorder',
        description:
          'Inspeksi gate POST /api/tasks/reorder: untuk sekumpulan taskId, laporkan project mana saja yang akan tersentuh batch itu dan apakah user tertentu boleh menulis di SEMUA project tersebut (requireProjectMember + permissions.task.write.minProjectRole, system admin bypass). Read-only: tidak menulis apa pun. Role memperhitungkan overdue lock (project terkunci melaporkan anggotanya sebagai VIEWER).',
        inputSchema: {
          taskIds: z.array(z.string()).min(1).describe('Daftar taskId seperti pada body updates[].id'),
          userEmail: z.string().email().describe('User yang diuji sebagai caller'),
        },
      },
      async ({ taskIds, userEmail }) => {
        const user = await resolveUserEmail(userEmail)
        if (!user) return jsonText({ error: `User not found: ${userEmail}` })
        const ids = [...new Set(taskIds)]
        const tasks = await prisma.task.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true, projectId: true, project: { select: { name: true } } },
        })
        const missing = ids.filter((id) => !tasks.some((t) => t.id === id))
        const minWriteRoles = await getPermissionRule('permissions.task.write.minProjectRole')
        const admin = isSystemAdmin(user.role)
        const byProject = new Map(tasks.map((t) => [t.projectId, t.project.name]))
        const projects = await Promise.all(
          [...byProject.entries()].map(async ([projectId, name]) => {
            const m = await requireProjectMember(projectId, user.id)
            return {
              projectId,
              name,
              taskCount: tasks.filter((t) => t.projectId === projectId).length,
              effectiveRole: m?.role ?? null,
              writable: admin || (m != null && meetsMinProjectRole(m.role, minWriteRoles)),
            }
          }),
        )
        return jsonText({
          userEmail,
          systemAdmin: admin,
          minWriteRoles,
          missingTaskIds: missing,
          projectCount: projects.length,
          projects,
          // Sama seperti handler: id hilang → 404, satu project tak writable → 403 untuk seluruh batch.
          expectedStatus: missing.length ? 404 : projects.every((p) => p.writable) ? 200 : 403,
        })
      },
    )

    server.registerTool(
      'task_reorder_transition_check',
      {
        title: 'Cek transisi status batch reorder',
        description:
          'Inspeksi gate status POST /api/tasks/reorder: untuk tiap baris updates[] yang membawa `status`, laporkan apakah transisi dari status task sekarang legal untuk kind-nya menurut getAllowedTaskTransitions (src/lib/task-lifecycle.ts) — state machine yang sama dipakai PATCH /api/tasks/:id. Baris tanpa `status`, atau yang statusnya sama dengan sekarang, dihitung no-op dan selalu lolos. Satu baris ilegal menolak SELURUH batch (400, tanpa tulisan apa pun). Read-only: tidak menulis apa pun.',
        inputSchema: {
          updates: z
            .array(z.object({ id: z.string(), status: z.string().optional() }))
            .min(1)
            .describe('Seperti body updates[] pada endpoint; kanbanOrder tidak dipakai di sini'),
        },
      },
      async ({ updates }) => {
        const ids = [...new Set(updates.map((u) => u.id))]
        const tasks = await prisma.task.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true, title: true, status: true, kind: true },
        })
        const byId = new Map(tasks.map((t) => [t.id, t]))
        const rows = updates.map((u) => {
          const t = byId.get(u.id)
          if (!t) return { id: u.id, found: false, noop: false, legal: false, reason: 'Task tidak ditemukan' }
          const base = { id: u.id, found: true, title: t.title, kind: t.kind, from: t.status, to: u.status ?? null }
          if (!u.status || u.status === t.status) return { ...base, noop: true, legal: true }
          const allowed = getAllowedTaskTransitions(t.status, t.kind)
          const legal = allowed.includes(u.status)
          return {
            ...base,
            noop: false,
            allowed,
            legal,
            reason: legal ? undefined : `${t.status} → ${u.status} tidak diizinkan untuk kind ${t.kind}`,
          }
        })
        const firstIllegal = rows.find((r) => !r.legal)
        return jsonText({
          rowCount: rows.length,
          transitionCount: rows.filter((r) => r.found && !r.noop && r.legal).length,
          rows,
          firstIllegal: firstIllegal ?? null,
          // Sama seperti handler: id hilang → 404, transisi ilegal → 400 untuk seluruh batch.
          expectedStatus: rows.some((r) => !r.found) ? 404 : firstIllegal ? 400 : 200,
        })
      },
    )
  },
}

export const tasksTools: ToolModule = {
  name: 'tasks',
  scope: 'admin',
  register(server) {
    registerTaskWriteTools(server)
    registerChecklistTools(server)
    registerDependencyTools(server)
    registerBulkTools(server)
  },
}
