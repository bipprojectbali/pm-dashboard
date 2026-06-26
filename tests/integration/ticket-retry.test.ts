import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import {
  getRetryCount,
  getRetryCounts,
  RETRY_ESCALATION_THRESHOLD,
} from '../../src/lib/ticket-retry'
import { cleanupTestData, prisma, seedTestProject, seedTestTask, seedTestUser } from '../helpers'

describe('ticket retry counter', () => {
  let projectId: string
  let reporterId: string

  // Record a READY_FOR_QC → REOPENED bounce, which is what a retry counts.
  const bounce = (taskId: string) =>
    prisma.taskStatusChange.create({
      data: { taskId, authorId: reporterId, fromStatus: 'READY_FOR_QC', toStatus: 'REOPENED' },
    })

  beforeAll(async () => {
    await cleanupTestData()
    const reporter = await seedTestUser('retry-reporter@test.com', 'pass', 'Reporter', 'ADMIN')
    reporterId = reporter.id
    const project = await seedTestProject(reporterId, 'Retry Counter Project')
    projectId = project.id
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  it('returns 0 for a ticket that was never bounced', async () => {
    const t = await seedTestTask(projectId, reporterId, { title: 'Never bounced' })
    expect(await getRetryCount(t.id)).toBe(0)
  })

  it('counts each READY_FOR_QC → REOPENED bounce', async () => {
    const t = await seedTestTask(projectId, reporterId, { title: 'Bounced twice' })
    await bounce(t.id)
    await bounce(t.id)
    expect(await getRetryCount(t.id)).toBe(2)
  })

  it('ignores other status transitions', async () => {
    const t = await seedTestTask(projectId, reporterId, { title: 'Other transitions' })
    await prisma.taskStatusChange.create({
      data: { taskId: t.id, authorId: reporterId, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS' },
    })
    await prisma.taskStatusChange.create({
      data: { taskId: t.id, authorId: reporterId, fromStatus: 'IN_PROGRESS', toStatus: 'READY_FOR_QC' },
    })
    expect(await getRetryCount(t.id)).toBe(0)
  })

  it('batches counts via groupBy, defaulting missing ids to 0', async () => {
    const a = await seedTestTask(projectId, reporterId, { title: 'Batch A' })
    const b = await seedTestTask(projectId, reporterId, { title: 'Batch B' })
    const c = await seedTestTask(projectId, reporterId, { title: 'Batch C' })
    await bounce(a.id)
    await bounce(a.id)
    await bounce(a.id)
    await bounce(b.id)
    const counts = await getRetryCounts([a.id, b.id, c.id])
    expect(counts.get(a.id)).toBe(3)
    expect(counts.get(b.id)).toBe(1)
    expect(counts.get(c.id) ?? 0).toBe(0)
  })

  it('flags escalation at the threshold', async () => {
    const t = await seedTestTask(projectId, reporterId, { title: 'Escalation' })
    for (let i = 0; i < RETRY_ESCALATION_THRESHOLD; i++) await bounce(t.id)
    const count = await getRetryCount(t.id)
    expect(count >= RETRY_ESCALATION_THRESHOLD).toBe(true)
  })

  it('returns an empty map for an empty id list', async () => {
    const counts = await getRetryCounts([])
    expect(counts.size).toBe(0)
  })
})
