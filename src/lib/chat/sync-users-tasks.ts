import { prisma } from '../db'
import { type SyncCtx, upsertDoc, fmtDate, daysAgo } from './upsert'

export async function syncUsers(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since, now } = ctx
  const users = await prisma.user.findMany({
    where: {
      blocked: false,
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      projectMemberships: { include: { project: { select: { id: true, name: true } } } },
      assignedTasks: {
        where: { status: { notIn: ['CLOSED'] }, deletedAt: null },
        select: { id: true, title: true, status: true, priority: true, dueAt: true },
      },
    },
  })

  for (const u of users) {
    const openTasks = u.assignedTasks
    const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now)
    const projects = u.projectMemberships.map((m) => `${m.project.name} (${m.role})`).join(', ')
    const overdueList = overdueTasks
      .slice(0, 5)
      .map((t) => `    - ${t.title} [${t.priority}]`)
      .join('\n')

    const content = [
      `[USER] ${u.name} — ${u.role} | ${u.email}`,
      `Status: ${u.blocked ? 'DIBLOKIR' : 'Aktif'}`,
      `Task aktif: ${openTasks.length} open, ${overdueTasks.length} overdue`,
      projects ? `Proyek: ${projects}` : null,
      overdueTasks.length > 0 ? `Task overdue:\n${overdueList}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await upsertDoc(
      { type: 'user', entityId: u.id, title: `${u.name} (${u.email})`, content, tags: u.role.toLowerCase() },
      embSettings,
      counters,
    )
  }
}

export async function syncTasks(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since, now, cutoff30d } = ctx
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      OR: [{ status: { notIn: ['CLOSED'] } }, { closedAt: { gte: cutoff30d } }],
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      assignee: { select: { name: true, email: true } },
      reporter: { select: { name: true } },
      project: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { name: true } } } },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { author: { select: { name: true } } },
      },
      statusChanges: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: { author: { select: { name: true } } },
      },
    },
  })

  for (const t of tasks) {
    const isOverdue = t.dueAt && new Date(t.dueAt) < now && t.status !== 'CLOSED'
    const overdueDays = t.dueAt && isOverdue ? daysAgo(t.dueAt) : 0
    const commentLines = t.comments.map((c) => `  - ${c.author?.name ?? 'Unknown'}: ${c.body.slice(0, 200)}`).join('\n')
    const historyLines = t.statusChanges
      .map((s) => `  - ${s.author?.name ?? '?'}: ${s.fromStatus}→${s.toStatus} (${fmtDate(s.createdAt)})`)
      .join('\n')
    const tagList = t.tags.map((tg) => tg.tag.name).join(', ')

    const content = [
      `[TASK] ${t.title}`,
      `Proyek: ${t.project?.name ?? '?'} | Assignee: ${t.assignee?.name ?? 'Unassigned'}${t.assignee?.email ? ` (${t.assignee.email})` : ''} | Reporter: ${t.reporter?.name ?? '?'}`,
      `Status: ${t.status} | Priority: ${t.priority} | Kind: ${t.kind}`,
      t.dueAt ? `Due: ${fmtDate(t.dueAt)}${isOverdue ? ` (OVERDUE ${overdueDays} hari)` : ''}` : 'Due: tidak ada',
      t.estimateHours ? `Estimasi: ${t.estimateHours}h` : null,
      t.description ? `Deskripsi: ${t.description.slice(0, 400)}` : null,
      t.comments.length > 0 ? `Komentar terbaru:\n${commentLines}` : null,
      t.statusChanges.length > 0 ? `History status:\n${historyLines}` : null,
      tagList ? `Tags: ${tagList}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const docTags = [t.status.toLowerCase(), t.priority.toLowerCase(), t.kind.toLowerCase(), tagList]
      .filter(Boolean)
      .join(',')
    await upsertDoc(
      { type: 'task', entityId: t.id, title: t.title, content, tags: docTags, projectId: t.projectId },
      embSettings,
      counters,
    )
  }
}
