import { prisma } from '../db'
import { type SyncCtx, upsertDoc, fmtDate } from './upsert'

export async function syncMilestones(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since, now } = ctx
  const milestones = await prisma.projectMilestone.findMany({
    where: since ? { updatedAt: { gte: since } } : {},
    include: { project: { select: { id: true, name: true } } },
    orderBy: { dueAt: 'asc' },
    take: 500,
  })
  for (const m of milestones) {
    const isOverdue = m.dueAt && new Date(m.dueAt) < now && !m.completedAt
    const content = [
      `[MILESTONE] ${m.title}`,
      `Proyek: ${m.project.name}`,
      m.dueAt ? `Due: ${fmtDate(m.dueAt)}${isOverdue ? ' (LEWAT)' : ''}` : 'Due: tidak ada',
      m.completedAt ? `Selesai: ${fmtDate(m.completedAt)}` : 'Belum selesai',
      m.description ? `Catatan: ${m.description.slice(0, 300)}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'milestone',
        entityId: m.id,
        title: `Milestone: ${m.title}`,
        content,
        tags: m.completedAt ? 'milestone,completed' : 'milestone,open',
        projectId: m.projectId,
      },
      embSettings,
      counters,
    )
  }
}

export async function syncExtensions(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since } = ctx
  const extensions = await prisma.projectExtension.findMany({
    where: since ? { createdAt: { gte: since } } : {},
    include: {
      project: { select: { id: true, name: true } },
      extendedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  for (const ext of extensions) {
    const content = [
      `[EXTENSION] Perpanjangan deadline ${ext.project.name}`,
      `Dari ${fmtDate(ext.previousEndAt ?? null)} → ${fmtDate(ext.newEndAt)}`,
      ext.extendedBy ? `Diajukan oleh: ${ext.extendedBy.name} (${ext.extendedBy.email})` : null,
      `Tanggal: ${fmtDate(ext.createdAt)}`,
      ext.reason ? `Alasan: ${ext.reason}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'extension',
        entityId: ext.id,
        title: `Extension: ${ext.project.name}`,
        content,
        tags: 'extension',
        projectId: ext.projectId,
      },
      embSettings,
      counters,
    )
  }
}

export async function syncDependencies(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters } = ctx
  const depRows = await prisma.taskDependency.findMany({
    include: {
      task: { select: { id: true, title: true, projectId: true, project: { select: { name: true } } } },
      blockedBy: { select: { id: true, title: true, status: true } },
    },
  })
  const depByTask = new Map<string, typeof depRows>()
  for (const d of depRows) {
    const list = depByTask.get(d.taskId) ?? []
    list.push(d)
    depByTask.set(d.taskId, list)
  }
  for (const [taskId, deps] of depByTask) {
    const first = deps[0]
    const blockerLines = deps.map((d) => `  - ${d.blockedBy.title} (${d.blockedBy.status})`).join('\n')
    const content = [
      `[DEPENDENCY] Task "${first.task.title}" terblok oleh ${deps.length} task`,
      `Proyek: ${first.task.project?.name ?? '?'}`,
      `Daftar blocker:\n${blockerLines}`,
    ].join('\n')
    await upsertDoc(
      {
        type: 'dependency',
        entityId: taskId,
        title: `Blocker: ${first.task.title}`,
        content,
        tags: 'dependency,blocked',
        projectId: first.task.projectId,
      },
      embSettings,
      counters,
    )
  }
}

export async function syncEvidence(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since } = ctx
  const evidence = await prisma.taskEvidence.findMany({
    where: since ? { createdAt: { gte: since } } : {},
    include: {
      task: { select: { id: true, title: true, projectId: true, project: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  for (const ev of evidence) {
    const content = [
      `[EVIDENCE] ${ev.kind} pada task "${ev.task?.title ?? '?'}"`,
      `Proyek: ${ev.task?.project?.name ?? '?'}`,
      `URL: ${ev.url}`,
      ev.note ? `Catatan: ${ev.note}` : null,
      `Ditambahkan: ${fmtDate(ev.createdAt)}`,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'evidence',
        entityId: ev.id,
        title: `Evidence: ${ev.task?.title ?? ev.url.slice(0, 60)}`,
        content,
        tags: `evidence,${ev.kind.toLowerCase()}`,
        projectId: ev.task?.projectId ?? null,
      },
      embSettings,
      counters,
    )
  }
}
