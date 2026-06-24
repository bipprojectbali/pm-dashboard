import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'

export async function audit(userId: string | null, action: string, detail: string | null) {
  await prisma.auditLog.create({ data: { userId, action, detail, ip: 'mcp' } }).catch(() => {})
}

export async function loadTicket(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true, githubRepo: true, isSelf: true } },
      reporter: { select: { id: true, name: true, email: true, role: true } },
      assignee: { select: { id: true, name: true, email: true, role: true } },
      tags: { include: { tag: true } },
      evidence: { orderBy: { createdAt: 'asc' } },
      comments: {
        include: { author: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      checklist: { orderBy: { order: 'asc' } },
      statusChanges: {
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}
