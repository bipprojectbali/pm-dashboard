// Core notification creation: preference gate + DB insert + best-effort WS push.
// Task-event notifiers live in notifications.task.ts; the due/overdue cron sweep
// in notifications.sweep.ts. Public surface is re-exported from notifications.ts.
import type { NotificationKind } from '../../generated/prisma'
import { prisma } from './db'
import { broadcastToUser } from './presence'
import { isGatedKind, isNotificationAllowed } from './user-preferences'

export type NotifyInput = {
  recipientId: string
  actorId?: string | null
  kind: NotificationKind
  taskId?: string | null
  projectId?: string | null
  title: string
  body?: string | null
}

export async function createNotification(input: NotifyInput): Promise<void> {
  if (input.actorId && input.actorId === input.recipientId) return
  // Honour the recipient's notification preferences (opt-out). Only gated kinds
  // (TASK_ASSIGNED / TASK_STATUS_CHANGED / TASK_MENTIONED) hit the DB for prefs;
  // others always deliver.
  if (isGatedKind(input.kind)) {
    const recipient = await prisma.user.findUnique({
      where: { id: input.recipientId },
      select: { preferences: true },
    })
    if (!isNotificationAllowed(input.kind, recipient?.preferences)) return
  }
  const n = await prisma.notification.create({
    data: {
      recipientId: input.recipientId,
      actorId: input.actorId ?? null,
      kind: input.kind,
      taskId: input.taskId ?? null,
      projectId: input.projectId ?? null,
      title: input.title,
      body: input.body ?? null,
    },
  })
  try {
    broadcastToUser(input.recipientId, { type: 'notification', id: n.id, kind: n.kind, title: n.title })
  } catch {
    // broadcast is best-effort
  }
}
