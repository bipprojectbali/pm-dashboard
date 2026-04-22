import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { jsonText, type ToolModule } from './shared'

const AI_QUEUE_TAG = 'ai-queue'
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

async function loadTicket(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true, githubRepo: true } },
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      tags: { include: { tag: true } },
      evidence: { orderBy: { createdAt: 'asc' } },
      comments: {
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      checklist: { orderBy: { order: 'asc' } },
    },
  })
}

async function findAiQueueTasks(projectId: string | undefined) {
  const tasks = await prisma.task.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      status: { in: ['OPEN', 'REOPENED'] },
      tags: { some: { tag: { name: AI_QUEUE_TAG } } },
    },
    include: {
      project: { select: { id: true, name: true, githubRepo: true } },
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      _count: { select: { evidence: true, comments: true } },
    },
  })
  return tasks.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 0
    const pb = PRIORITY_RANK[b.priority] ?? 0
    if (pa !== pb) return pb - pa
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

export const ticketsReadonly: ToolModule = {
  name: 'tickets-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'ticket_queue',
      {
        title: 'List AI ticket queue',
        description:
          `List open/reopened tasks tagged "${AI_QUEUE_TAG}" across all projects (or one), ordered by priority then age. These are tickets QA/QC flagged for Claude to fix. Use ticket_pick to claim the next one.`,
        inputSchema: {
          projectId: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(20),
        },
      },
      async ({ projectId, limit }) => {
        const all = await findAiQueueTasks(projectId)
        return jsonText({ count: all.length, tickets: all.slice(0, limit) })
      },
    )
  },
}

export const ticketsTools: ToolModule = {
  name: 'tickets',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'ticket_pick',
      {
        title: 'Claim next AI ticket',
        description:
          `Atomically claim the highest-priority open/reopened task tagged "${AI_QUEUE_TAG}" by transitioning it to IN_PROGRESS (and optionally assigning to you). Returns the full ticket incl. description, evidence, comments, checklist, and project.githubRepo so you know where to work. If no ticket matches, returns { picked: false }.`,
        inputSchema: {
          projectId: z.string().optional().describe('Scope pick to one project.'),
          claimerEmail: z
            .string()
            .email()
            .optional()
            .describe('If provided, sets task.assigneeId to this user. Creates no user — must exist.'),
        },
      },
      async ({ projectId, claimerEmail }) => {
        let claimerId: string | null = null
        if (claimerEmail) {
          const u = await prisma.user.findUnique({ where: { email: claimerEmail }, select: { id: true } })
          if (!u) return jsonText({ error: `Claimer not found: ${claimerEmail}` })
          claimerId = u.id
        }
        const queue = await findAiQueueTasks(projectId)
        for (const candidate of queue) {
          const result = await prisma.task.updateMany({
            where: { id: candidate.id, status: { in: ['OPEN', 'REOPENED'] } },
            data: {
              status: 'IN_PROGRESS',
              ...(claimerId ? { assigneeId: claimerId } : {}),
            },
          })
          if (result.count === 1) {
            await prisma.taskStatusChange.create({
              data: {
                taskId: candidate.id,
                authorId: claimerId,
                fromStatus: candidate.status,
                toStatus: 'IN_PROGRESS',
              },
            })
            const full = await loadTicket(candidate.id)
            appLog('info', `MCP: ticket_pick claimed ${candidate.id} (${candidate.title})`)
            return jsonText({ picked: true, ticket: full })
          }
        }
        return jsonText({ picked: false, reason: `No tickets tagged "${AI_QUEUE_TAG}" available.` })
      },
    )

    server.registerTool(
      'ticket_submit',
      {
        title: 'Submit fix for AI ticket',
        description:
          'Post a PR link as a comment and transition the ticket to READY_FOR_QC. Use this after you push a fix branch and open the PR. Authored-by email must exist as a User.',
        inputSchema: {
          taskId: z.string(),
          prUrl: z.string().url().describe('Link to the PR containing the fix.'),
          summary: z.string().min(1).describe('One-paragraph human summary of the fix.'),
          authorEmail: z.string().email(),
        },
      },
      async ({ taskId, prUrl, summary, authorEmail }) => {
        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, status: true, kind: true, title: true } })
        if (!task) return jsonText({ error: 'Task not found' })
        const author = await prisma.user.findUnique({ where: { email: authorEmail }, select: { id: true, role: true } })
        if (!author) return jsonText({ error: `Author not found: ${authorEmail}` })
        if (task.status !== 'IN_PROGRESS') {
          return jsonText({
            error: `ticket is ${task.status}; submit_fix expects IN_PROGRESS. Use ticket_pick first, or transition manually.`,
          })
        }
        const body = `**Fix submitted**\n\n${summary}\n\nPR: ${prUrl}`
        await prisma.$transaction([
          prisma.taskComment.create({ data: { taskId, authorId: author.id, authorTag: author.role, body } }),
          prisma.task.update({ where: { id: taskId }, data: { status: 'READY_FOR_QC' } }),
          prisma.taskStatusChange.create({
            data: { taskId, authorId: author.id, fromStatus: 'IN_PROGRESS', toStatus: 'READY_FOR_QC' },
          }),
        ])
        appLog('info', `MCP: ticket_submit #${taskId} → READY_FOR_QC with PR ${prUrl}`)
        return jsonText({ ok: true, taskId, newStatus: 'READY_FOR_QC', prUrl })
      },
    )
  },
}
