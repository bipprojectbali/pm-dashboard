import { toLocalDateStr } from '../../lib/dates'

export interface RetroTaskRow {
  id: string
  title: string
  status: string
  priority: string
  assigneeEmail: string | null
  dueAt: string | null
  closedAt: string | null
  estimateHours: number | null
}

export interface RetroExtension {
  id: string
  previousEndAt: string | null
  newEndAt: string
  reason: string | null
  extendedBy: string | null
  createdAt: string
}

export interface RetroContributor {
  userId: string | null
  email: string | null
  name: string | null
  closed: number
  commits: number
  prsMerged: number
}

export interface RetroResult {
  project: { id: string; name: string; status: string; endsAt: string | null }
  window: { since: string; until: string; days: number }
  summary: {
    closed: number
    slipped: number
    stillBlocked: number
    extensions: number
    newTasks: number
    estimateHoursClosed: number
  }
  shipped: RetroTaskRow[]
  slipped: RetroTaskRow[]
  stillBlocked: RetroTaskRow[]
  biggestMisses: (RetroTaskRow & { daysOverDue: number })[]
  extensions: RetroExtension[]
  github: {
    commits: number
    prsOpened: number
    prsMerged: number
    prsClosed: number
    reviews: number
  }
  contributors: RetroContributor[]
}

export const WINDOWS: { label: string; days: number }[] = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return toLocalDateStr(new Date(iso))
}
