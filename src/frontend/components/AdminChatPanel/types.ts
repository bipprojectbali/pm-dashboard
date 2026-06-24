export interface ChatSource {
  ref: string
  type: string
  entityId: string
  title: string
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
  result?: { ok: boolean; error?: string; rows?: unknown[]; summary?: Record<string, unknown>; truncated?: boolean }
  pending?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  toolCalls?: ToolCall[]
}

export interface SyncResult {
  ok: boolean
  synced: number
  pruned: number
  failedEmbeddings: number
  duration: number
}

export const TOOL_LABEL: Record<string, string> = {
  query_users: 'Cari User',
  query_tasks: 'Query Task',
  query_project_detail: 'Detail Proyek',
  query_github_activity: 'Aktivitas GitHub',
  query_effort: 'Effort Tracking',
}

export const QUICK_PROMPTS = [
  'Proyek mana yang paling berisiko?',
  'Siapa yang paling banyak commit minggu ini?',
  'Task mana yang overbudget?',
  'Siapa yang paling overloaded?',
  'Task overdue apa saja?',
  'Events mendatang minggu ini?',
]

export const TYPE_LABEL: Record<string, string> = {
  user: 'User',
  task: 'Task',
  project: 'Project',
  event: 'Event',
  comment: 'Komentar',
  github_project: 'GitHub',
  effort_user: 'Effort',
  effort_task: 'Effort Task',
  ghost_task: 'Ghost',
  milestone: 'Milestone',
  extension: 'Extension',
  dependency: 'Blocker',
  evidence: 'Evidence',
  audit_recent: 'Audit',
  agent_status: 'Agent',
  report_history: 'Laporan',
  project_retro: 'Retro',
}

export const TYPE_COLOR: Record<string, string> = {
  user: 'blue',
  task: 'cyan',
  project: 'grape',
  event: 'orange',
  comment: 'gray',
  github_project: 'dark',
  effort_user: 'lime',
  effort_task: 'lime',
  ghost_task: 'red',
  milestone: 'indigo',
  extension: 'pink',
  dependency: 'yellow',
  evidence: 'teal',
  audit_recent: 'gray',
  agent_status: 'violet',
  report_history: 'blue',
  project_retro: 'grape',
}

export function formatAge(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return 'baru saja'
  if (sec < 3600) return `${Math.floor(sec / 60)}m lalu`
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h lalu`
  return `${Math.floor(sec / 86_400)}d lalu`
}
