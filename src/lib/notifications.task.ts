// Task-event notifiers: assigned, commented, status-changed. Each resolves the
// recipient set (reporter + assignee, minus the actor) and delegates to
// createNotification. Re-exported from notifications.ts.
import { createNotification } from './notifications.core'

export async function notifyTaskAssigned(args: {
  taskId: string
  projectId: string
  taskTitle: string
  assigneeId: string
  actorId: string
  actorName: string
  taskKind?: string
}): Promise<void> {
  await createNotification({
    recipientId: args.assigneeId,
    actorId: args.actorId,
    kind: 'TASK_ASSIGNED',
    taskId: args.taskId,
    projectId: args.projectId,
    title: `${args.actorName} assigned you ${args.taskKind === 'IDEA' ? 'an idea' : 'a task'}`,
    body: args.taskTitle,
  })
}

export async function notifyTaskCommented(args: {
  taskId: string
  projectId: string
  taskTitle: string
  reporterId: string
  assigneeId: string | null
  actorId: string
  actorName: string
  commentSnippet: string
}): Promise<void> {
  const recipients = new Set<string>()
  if (args.assigneeId) recipients.add(args.assigneeId)
  if (args.reporterId) recipients.add(args.reporterId)
  recipients.delete(args.actorId)
  await Promise.all(
    [...recipients].map((recipientId) =>
      createNotification({
        recipientId,
        actorId: args.actorId,
        kind: 'TASK_COMMENTED',
        taskId: args.taskId,
        projectId: args.projectId,
        title: `${args.actorName} commented on "${args.taskTitle}"`,
        body: args.commentSnippet,
      }),
    ),
  )
}

export async function notifyTaskStatusChanged(args: {
  taskId: string
  projectId: string
  taskTitle: string
  reporterId: string
  assigneeId: string | null
  actorId: string
  actorName: string
  fromStatus: string
  toStatus: string
}): Promise<void> {
  const recipients = new Set<string>()
  if (args.assigneeId) recipients.add(args.assigneeId)
  if (args.reporterId) recipients.add(args.reporterId)
  recipients.delete(args.actorId)
  await Promise.all(
    [...recipients].map((recipientId) =>
      createNotification({
        recipientId,
        actorId: args.actorId,
        kind: 'TASK_STATUS_CHANGED',
        taskId: args.taskId,
        projectId: args.projectId,
        title: `"${args.taskTitle}" moved to ${args.toStatus.replace('_', ' ')}`,
        body: `${args.actorName} changed status from ${args.fromStatus.replace('_', ' ')}`,
      }),
    ),
  )
}
