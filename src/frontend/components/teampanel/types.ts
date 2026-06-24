export type Teammate = {
  id: string
  name: string
  email: string
  role: 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'
  blocked: boolean
  image?: string | null
  sharedProjects: Array<{ projectId: string; projectName: string; myRole: string; theirRole: string }>
  openTasks: number
  overdueTasks: number
}

export type TeamResponse = {
  teammates: Teammate[]
  projects: Array<{ id: string; name: string; myRole: string }>
}

export type TeamActivityItem = {
  id: string
  kind: 'STATUS_CHANGE' | 'COMMENT'
  createdAt: string
  author: { id: string; name: string; email: string } | null
  task: { id: string; title: string; projectId: string }
  project: { id: string; name: string } | null
  detail: { fromStatus: string | null; toStatus: string | null; body: string | null }
}

export type TeamActivityResponse = { activity: TeamActivityItem[] }

export const ROLE_COLOR: Record<string, string> = {
  USER: 'blue',
  QC: 'teal',
  ADMIN: 'violet',
  SUPER_ADMIN: 'red',
  OWNER: 'violet',
  PM: 'blue',
  MEMBER: 'gray',
  VIEWER: 'gray',
}

export const STATUS_COLOR: Record<string, string> = {
  OPEN: 'gray',
  IN_PROGRESS: 'blue',
  READY_FOR_QC: 'cyan',
  REOPENED: 'orange',
  CLOSED: 'teal',
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const suffix = diff >= 0 ? 'lalu' : 'lagi'
  if (days > 0) return `${days}h ${suffix}`
  if (hours > 0) return `${hours}j ${suffix}`
  if (mins > 0) return `${mins}m ${suffix}`
  return 'baru saja'
}
