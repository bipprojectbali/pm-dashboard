export interface UserReportData {
  user: { id: string; name: string; email: string; role: string; image: string | null; blocked: boolean }
  total: number
  open: number
  closed: number
  overdue: number
  blocked: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  byKind: Record<string, number>
  effort: { actualHours: number; estimateHours: number; over: number; under: number; on: number }
  github7d: Record<string, number>
  overdueTasks: Array<{ id: string; title: string; priority: string; status: string; dueAt: string | null }>
  taskTrend: Array<{ date: string; created: number; closed: number }>
}

export const STATUS_COLOR: Record<string, string> = {
  OPEN: '#228be6',
  IN_PROGRESS: '#fd7e14',
  READY_FOR_QC: '#9775fa',
  REOPENED: '#fa5252',
  CLOSED: '#12b886',
}

export const PRIORITY_COLOR: Record<string, string> = {
  LOW: '#868e96',
  MEDIUM: '#228be6',
  HIGH: '#fd7e14',
  CRITICAL: '#fa5252',
}
