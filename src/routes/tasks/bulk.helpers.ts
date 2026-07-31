import { prisma } from '../../lib/db'

export type RawTaskInput = {
  title?: string
  description?: string
  kind?: string
  priority?: string
  route?: string | null
  assigneeEmail?: string | null
  startsAt?: string | null
  dueAt?: string | null
  estimateHours?: number | null
  tagNames?: string[]
  phaseName?: string | null
}

// All five task kinds are valid for bulk import, matching the single-create
// form (SingleTaskForm) which already offers TASK/BUG/QC/TICKET/IDEA.
export type BulkTaskKind = 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'

export type NormalizedRow = {
  title: string
  description: string
  kind: BulkTaskKind
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  route: string | null
  assigneeEmail: string | null
  startsAt: Date | null
  dueAt: Date | null
  estimateHours: number | null
  tagNames: string[]
  phaseName: string | null
}

export type RowError = { index: number; field: string; message: string }

export type NormalizeResult = {
  normalized: NormalizedRow[]
  errors: RowError[]
  emailSet: Set<string>
  tagNameSet: Set<string>
  phaseNameSet: Set<string>
}

const KINDS = new Set(['TASK', 'BUG', 'QC', 'TICKET', 'IDEA'])
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

export function normalizeBulkRows(tasks: RawTaskInput[]): NormalizeResult {
  const errors: RowError[] = []
  const emailSet = new Set<string>()
  const tagNameSet = new Set<string>()
  const phaseNameSet = new Set<string>()
  const normalized: NormalizedRow[] = []

  for (let i = 0; i < tasks.length; i++) {
    const r = tasks[i]
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    const description = typeof r.description === 'string' ? r.description.trim() : ''
    if (!title) errors.push({ index: i, field: 'title', message: 'title wajib diisi' })
    else if (title.length > 500) errors.push({ index: i, field: 'title', message: 'title > 500 char' })
    if (!description) errors.push({ index: i, field: 'description', message: 'description wajib diisi' })
    const kind = (r.kind ?? 'TASK').toUpperCase()
    if (!KINDS.has(kind)) errors.push({ index: i, field: 'kind', message: 'kind harus TASK|BUG|QC|TICKET|IDEA' })
    const priority = (r.priority ?? 'MEDIUM').toUpperCase()
    if (!PRIORITIES.has(priority))
      errors.push({ index: i, field: 'priority', message: 'priority harus LOW|MEDIUM|HIGH|CRITICAL' })
    let startsAt: Date | null = null
    if (r.startsAt) {
      const d = new Date(r.startsAt)
      if (Number.isNaN(d.getTime())) errors.push({ index: i, field: 'startsAt', message: 'startsAt invalid date' })
      else startsAt = d
    }
    let dueAt: Date | null = null
    if (r.dueAt) {
      const d = new Date(r.dueAt)
      if (Number.isNaN(d.getTime())) errors.push({ index: i, field: 'dueAt', message: 'dueAt invalid date' })
      else dueAt = d
    }
    if (startsAt && dueAt && dueAt < startsAt) errors.push({ index: i, field: 'dueAt', message: 'dueAt < startsAt' })
    let estimateHours: number | null = null
    if (r.estimateHours !== null && r.estimateHours !== undefined && r.estimateHours !== ('' as unknown)) {
      const n = typeof r.estimateHours === 'number' ? r.estimateHours : Number(r.estimateHours)
      if (!Number.isFinite(n) || n < 0)
        errors.push({ index: i, field: 'estimateHours', message: 'estimateHours harus angka ≥ 0' })
      else estimateHours = n
    }
    const assigneeEmail = r.assigneeEmail?.trim() || null
    if (assigneeEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail))
        errors.push({ index: i, field: 'assigneeEmail', message: 'assigneeEmail format invalid' })
      else emailSet.add(assigneeEmail)
    }
    const tagNames = Array.isArray(r.tagNames) ? r.tagNames.map((t) => String(t).trim()).filter(Boolean) : []
    for (const t of tagNames) tagNameSet.add(t)
    const phaseName = r.phaseName?.trim() || null
    if (phaseName) phaseNameSet.add(phaseName)
    normalized.push({
      title,
      description,
      kind: kind as BulkTaskKind,
      priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      route: r.route?.trim() || null,
      assigneeEmail,
      startsAt,
      dueAt,
      estimateHours,
      tagNames,
      phaseName,
    })
  }
  return { normalized, errors, emailSet, tagNameSet, phaseNameSet }
}

export type ResolveResult = {
  userByEmail: Map<string, string>
  tagIdByName: Map<string, string>
  phaseIdByName: Map<string, string>
  errors: RowError[]
}

export async function resolveBulkRefs(
  projectId: string,
  emailSet: Set<string>,
  tagNameSet: Set<string>,
  phaseNameSet: Set<string>,
  normalized: NormalizedRow[],
): Promise<ResolveResult> {
  const errors: RowError[] = []
  const users = emailSet.size
    ? await prisma.user.findMany({ where: { email: { in: [...emailSet] } }, select: { id: true, email: true } })
    : []
  const userByEmail = new Map(users.map((u) => [u.email, u.id]))
  for (let i = 0; i < normalized.length; i++) {
    const e = normalized[i].assigneeEmail
    if (e && !userByEmail.has(e)) errors.push({ index: i, field: 'assigneeEmail', message: `user not found: ${e}` })
  }
  const tagsByName = tagNameSet.size
    ? await prisma.tag.findMany({
        where: { projectId, name: { in: [...tagNameSet] } },
        select: { id: true, name: true },
      })
    : []
  const tagIdByName = new Map(tagsByName.map((t) => [t.name, t.id]))
  for (let i = 0; i < normalized.length; i++) {
    for (const tn of normalized[i].tagNames) {
      if (!tagIdByName.has(tn)) errors.push({ index: i, field: 'tagNames', message: `tag not in project: ${tn}` })
    }
  }
  const phasesByName = phaseNameSet.size
    ? await prisma.projectPhase.findMany({
        where: { projectId, title: { in: [...phaseNameSet] } },
        select: { id: true, title: true },
      })
    : []
  const phaseIdByName = new Map(phasesByName.map((p) => [p.title, p.id]))
  return { userByEmail, tagIdByName, phaseIdByName, errors }
}
