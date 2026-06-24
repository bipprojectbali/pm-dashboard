import { prisma } from './db'

export type SendTrigger = 'cron' | 'manual' | 'custom'
export type ReportHistoryRange = '1m' | '3m' | 'all'

export interface SendHistoryEntry {
  sentAt: string
  ok: boolean
  message: string
  trigger: SendTrigger
  markdown?: string
}

export interface ReportHistoryEntry {
  id: string
  sentAt: string
  ok: boolean
  message: string
  trigger: SendTrigger
  markdown?: string | null
  createdAt: string
}

export async function recordSendHistory(entry: SendHistoryEntry): Promise<void> {
  await prisma.reportHistory.create({
    data: {
      sentAt: new Date(entry.sentAt),
      ok: entry.ok,
      message: entry.message,
      trigger: entry.trigger,
      markdown: entry.markdown ?? null,
    },
  })
}

export async function getSendHistory(opts?: {
  page?: number
  limit?: number
  range?: ReportHistoryRange
}): Promise<{ entries: ReportHistoryEntry[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts?.page ?? 1)
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 20))
  const range = opts?.range ?? 'all'

  const since =
    range === '1m'
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      : range === '3m'
        ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        : null

  const where = since ? { sentAt: { gte: since } } : {}

  const [rows, total] = await Promise.all([
    prisma.reportHistory.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reportHistory.count({ where }),
  ])

  const entries: ReportHistoryEntry[] = rows.map((r) => ({
    id: r.id,
    sentAt: r.sentAt.toISOString(),
    ok: r.ok,
    message: r.message,
    trigger: r.trigger as SendTrigger,
    markdown: r.markdown,
    createdAt: r.createdAt.toISOString(),
  }))

  return { entries, total, page, limit }
}

export async function deleteReportHistory(id: string): Promise<void> {
  await prisma.reportHistory.delete({ where: { id } })
}
