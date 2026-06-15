export interface RetroOptions {
  projectId: string
  since: Date
  until?: Date
}

export interface RetroTaskRow {
  id: string
  title: string
  status: string
  priority: string
  assigneeEmail: string | null
  dueAt: Date | null
  closedAt: Date | null
  estimateHours: number | null
}

export interface RetroContributor {
  userId: string | null
  email: string | null
  name: string | null
  closed: number
  commits: number
  prsMerged: number
}

export interface RetroExtension {
  id: string
  previousEndAt: Date | null
  newEndAt: Date
  reason: string | null
  extendedBy: string | null
  createdAt: Date
}

export interface RetroGithubSummary {
  commits: number
  prsOpened: number
  prsMerged: number
  prsClosed: number
  reviews: number
}

export interface RetroResult {
  project: { id: string; name: string; status: string; endsAt: Date | null }
  window: { since: Date; until: Date; days: number }
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
  github: RetroGithubSummary
  contributors: RetroContributor[]
}
