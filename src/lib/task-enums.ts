// Shared task enum values + validators. Prisma enums are compile-time only, so
// runtime input (query params, JSON bodies) must be checked against these before
// hitting Prisma — otherwise an invalid value throws a Prisma error → HTTP 500
// instead of a clean 400. Previously duplicated inline across route handlers.
export const TASK_STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'] as const
export const TASK_KIND_VALUES = ['TASK', 'BUG', 'QC', 'TICKET', 'IDEA'] as const
export const TASK_PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number]
export type TaskKind = (typeof TASK_KIND_VALUES)[number]
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number]

export function isValidStatus(s: string): s is TaskStatus {
  return (TASK_STATUS_VALUES as readonly string[]).includes(s)
}
export function isValidKind(s: string): s is TaskKind {
  return (TASK_KIND_VALUES as readonly string[]).includes(s)
}
export function isValidPriority(s: string): s is TaskPriority {
  return (TASK_PRIORITY_VALUES as readonly string[]).includes(s)
}
