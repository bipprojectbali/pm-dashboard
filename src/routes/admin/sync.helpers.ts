import { prisma } from '../../lib/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ins = (fn: (a: any) => Promise<unknown>, rows: unknown[]) => fn({ data: rows, skipDuplicates: true })

export async function wipeEntities(entities: string[]) {
  const want = (k: string) => entities.length === 0 || entities.includes(k)
  if (want('tasks') || want('projects')) {
    await prisma.taskStatusChange.deleteMany()
    await prisma.taskComment.deleteMany()
    await prisma.taskEvidence.deleteMany()
    await prisma.taskChecklistItem.deleteMany()
    await prisma.taskDependency.deleteMany()
    await prisma.taskTag.deleteMany()
    await prisma.task.deleteMany()
  }
  if (want('tags') || want('projects')) await prisma.tag.deleteMany()
  if (want('projects')) {
    await prisma.projectExtension.deleteMany()
    await prisma.projectMilestone.deleteMany()
    await prisma.projectMember.deleteMany()
    await prisma.projectGithubEvent.deleteMany()
    await prisma.githubWebhookLog.deleteMany()
    await prisma.project.deleteMany()
  }
  if (want('milestones')) await prisma.projectMilestone.deleteMany()
  if (want('users')) {
    await prisma.notification.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
  }
}

export async function importEntities(
  data: Record<string, unknown>,
  entities: string[],
): Promise<Record<string, number>> {
  const want = (k: string) => entities.length === 0 || entities.includes(k)
  const summary: Record<string, number> = {}

  if (data.users && want('users')) {
    const rows = (data.users as Array<Record<string, unknown>>).map((u) => ({ ...u, password: '' }))
    await ins(prisma.user.createMany.bind(prisma.user), rows)
    summary.users = rows.length
  }
  if (data.projects && want('projects')) {
    type ProjRow = { members?: unknown; extensions?: unknown; [k: string]: unknown }
    const projects = (data.projects as ProjRow[]).map(({ members: _m, extensions: _e, ...p }) => p)
    await ins(prisma.project.createMany.bind(prisma.project), projects)
    summary.projects = projects.length
    const members = (data.projects as ProjRow[]).flatMap((p) => (p.members as unknown[] | undefined) ?? [])
    if (members.length) await ins(prisma.projectMember.createMany.bind(prisma.projectMember), members)
    const exts = (data.projects as ProjRow[]).flatMap((p) => (p.extensions as unknown[] | undefined) ?? [])
    if (exts.length) await ins(prisma.projectExtension.createMany.bind(prisma.projectExtension), exts)
  }
  if (data.tags && want('tags')) {
    await ins(prisma.tag.createMany.bind(prisma.tag), data.tags as unknown[])
    summary.tags = (data.tags as unknown[]).length
  }
  if (data.milestones && want('milestones')) {
    await ins(prisma.projectMilestone.createMany.bind(prisma.projectMilestone), data.milestones as unknown[])
    summary.milestones = (data.milestones as unknown[]).length
  }
  if (data.tasks && want('tasks')) {
    type TaskRow = { tags?: unknown; checklist?: unknown; comments?: unknown; evidence?: unknown; statusChanges?: unknown; blockedBy?: unknown; [k: string]: unknown }
    const tasks = (data.tasks as TaskRow[]).map(
      ({ tags: _t, checklist: _c, comments: _cm, evidence: _e, statusChanges: _s, blockedBy: _b, ...t }) => t,
    )
    await ins(prisma.task.createMany.bind(prisma.task), tasks)
    summary.tasks = tasks.length
    const taskTags = (data.tasks as TaskRow[]).flatMap((t) =>
      ((t.tags as Array<{ tagId: string }> | undefined) ?? []).map((tt) => ({ taskId: t.id as string, tagId: tt.tagId })),
    )
    if (taskTags.length) await ins(prisma.taskTag.createMany.bind(prisma.taskTag), taskTags)
    const checklists = (data.tasks as TaskRow[]).flatMap((t) => (t.checklist as unknown[] | undefined) ?? [])
    if (checklists.length) await ins(prisma.taskChecklistItem.createMany.bind(prisma.taskChecklistItem), checklists)
    const comments = (data.tasks as TaskRow[]).flatMap((t) => (t.comments as unknown[] | undefined) ?? [])
    if (comments.length) await ins(prisma.taskComment.createMany.bind(prisma.taskComment), comments)
    const evidence = (data.tasks as TaskRow[]).flatMap((t) => (t.evidence as unknown[] | undefined) ?? [])
    if (evidence.length) await ins(prisma.taskEvidence.createMany.bind(prisma.taskEvidence), evidence)
    const statusChanges = (data.tasks as TaskRow[]).flatMap((t) => (t.statusChanges as unknown[] | undefined) ?? [])
    if (statusChanges.length) await ins(prisma.taskStatusChange.createMany.bind(prisma.taskStatusChange), statusChanges)
    const deps = (data.tasks as TaskRow[]).flatMap((t) => (t.blockedBy as unknown[] | undefined) ?? [])
    if (deps.length) await ins(prisma.taskDependency.createMany.bind(prisma.taskDependency), deps)
  }

  return summary
}
