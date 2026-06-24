import type { RiskSeverity } from './types'

export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  none: 'teal',
  low: 'blue',
  medium: 'orange',
  high: 'red',
}

export const GRADE_COLOR: Record<string, string> = {
  A: 'teal',
  B: 'green',
  C: 'yellow',
  D: 'orange',
  E: 'red',
  F: 'red',
}

export const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export const ACTION_COLOR: Record<string, string> = {
  LOGIN: 'green',
  LOGOUT: 'gray',
  LOGIN_FAILED: 'orange',
  LOGIN_BLOCKED: 'red',
  ROLE_CHANGED: 'violet',
  BLOCKED: 'red',
  UNBLOCKED: 'teal',
  PROJECT_MEMBER_ROLE_CHANGED: 'grape',
  TASK_CREATED: 'blue',
  AGENT_APPROVED: 'teal',
  AGENT_REVOKED: 'red',
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}
