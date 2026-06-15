import { prisma } from '../db'
import { type SyncCtx, upsertDoc, fmtDate } from './upsert'

export async function syncEvents(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since, now } = ctx
  const events = await prisma.event.findMany({
    where: {
      startsAt: { gte: now },
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      createdBy: { select: { name: true } },
      project: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { name: true } } } },
    },
  })

  for (const e of events) {
    const tagList = e.tags.map((t) => t.tag.name).join(', ')
    const content = [
      `[EVENT] ${e.title}`,
      `Waktu: ${fmtDate(e.startsAt)}${e.endsAt ? ` s.d. ${fmtDate(e.endsAt)}` : ''}`,
      e.location ? `Lokasi: ${e.location}` : null,
      e.project ? `Proyek: ${e.project.name}` : null,
      e.createdBy ? `Dibuat oleh: ${e.createdBy.name}` : null,
      e.description ? `Catatan: ${e.description.slice(0, 300)}` : null,
      tagList ? `Tags: ${tagList}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await upsertDoc(
      { type: 'event', entityId: e.id, title: e.title, content, tags: tagList, projectId: e.projectId ?? null },
      embSettings,
      counters,
    )
  }
}

export async function syncComments(ctx: SyncCtx): Promise<void> {
  const { counters, since, cutoff7d } = ctx
  const comments = await prisma.taskComment.findMany({
    where: { createdAt: { gte: since ?? cutoff7d } },
    include: {
      author: { select: { name: true } },
      task: { select: { title: true, projectId: true, project: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  for (const c of comments) {
    const content = [
      `[COMMENT] di task: ${c.task?.title ?? '?'}`,
      `Proyek: ${c.task?.project?.name ?? '?'}`,
      `Oleh: ${c.author?.name ?? '?'} | Tanggal: ${fmtDate(c.createdAt)}`,
      `Isi: ${c.body}`,
    ].join('\n')

    await upsertDoc(
      {
        type: 'comment',
        entityId: c.id,
        title: `Komentar: ${c.task?.title ?? '?'}`,
        content,
        projectId: c.task?.projectId ?? null,
      },
      undefined,
      counters,
    )
  }
}

export async function syncAuditLogs(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since, cutoff30d } = ctx
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: { in: ['ROLE_CHANGED', 'BLOCKED', 'UNBLOCKED'] },
      createdAt: { gte: since ?? cutoff30d },
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  for (const a of auditLogs) {
    const content = [
      `[AUDIT] ${a.action}`,
      a.user ? `Target user: ${a.user.name} (${a.user.email})` : null,
      `Waktu: ${fmtDate(a.createdAt)}`,
      a.detail ? `Detail: ${a.detail}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'audit_recent',
        entityId: a.id,
        title: `Audit: ${a.action} — ${a.user?.name ?? 'unknown'}`,
        content,
        tags: a.action.toLowerCase(),
      },
      embSettings,
      counters,
    )
  }
}

export async function syncReportHistory(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since, cutoff30d } = ctx
  const reports = await prisma.reportHistory.findMany({
    where: { sentAt: { gte: since ?? cutoff30d } },
    orderBy: { sentAt: 'desc' },
    take: 100,
  })
  for (const r of reports) {
    const content = [
      `[REPORT] Laporan ${r.trigger} — ${fmtDate(r.sentAt)}`,
      `Status: ${r.ok ? 'sukses' : 'gagal'}`,
      `Pesan: ${r.message.slice(0, 200)}`,
      r.markdown ? `\nIsi:\n${r.markdown.slice(0, 2000)}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'report_history',
        entityId: r.id,
        title: `Laporan ${fmtDate(r.sentAt)}`,
        content,
        tags: r.ok ? 'report,ok' : 'report,fail',
      },
      embSettings,
      counters,
    )
  }
}
