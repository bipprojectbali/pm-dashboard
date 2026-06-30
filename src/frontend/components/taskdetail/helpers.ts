import { useEffect, useState } from 'react'
import type { TaskKind, TaskStatus } from './types'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function allowedTransitions(current: TaskStatus, kind: TaskKind): TaskStatus[] {
  if (kind === 'TASK') {
    const m: Record<TaskStatus, TaskStatus[]> = {
      OPEN: ['IN_PROGRESS', 'CLOSED'],
      IN_PROGRESS: ['OPEN', 'CLOSED'],
      CLOSED: ['REOPENED'],
      REOPENED: ['IN_PROGRESS', 'CLOSED'],
      READY_FOR_QC: ['CLOSED', 'REOPENED'],
    }
    return m[current] ?? []
  }
  // IDEA only toggles OPEN ↔ CLOSED; promotion to work happens via kind change.
  if (kind === 'IDEA') {
    const m: Record<TaskStatus, TaskStatus[]> = {
      OPEN: ['CLOSED'],
      CLOSED: ['OPEN'],
      IN_PROGRESS: [],
      READY_FOR_QC: [],
      REOPENED: [],
    }
    return m[current] ?? []
  }
  // BUG, QC, and TICKET share the full QC-style lifecycle.
  const m: Record<TaskStatus, TaskStatus[]> = {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  }
  return m[current] ?? []
}

export function useWasLoading(loading: boolean): boolean {
  const [was, setWas] = useState(false)
  useEffect(() => {
    if (loading) setWas(true)
  }, [loading])
  return was
}
