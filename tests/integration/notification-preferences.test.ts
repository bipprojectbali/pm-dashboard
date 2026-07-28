import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createNotification } from '../../src/lib/notifications'
import { isNotificationAllowed } from '../../src/lib/user-preferences'
import { cleanupTestData, prisma, seedTestUser } from '../helpers'

// Verifies notification preferences actually gate delivery: a recipient who
// disabled a gated kind gets no Notification row; ungated kinds and users with
// no saved preferences always receive (opt-out model).

let recipientId = ''

beforeAll(async () => {
  await cleanupTestData()
  const u = await seedTestUser('notif-pref@example.com', 'pass123', 'Notif Pref', 'USER')
  recipientId = u.id
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

async function countFor(kind: string): Promise<number> {
  return prisma.notification.count({ where: { recipientId, kind: kind as never } })
}

describe('isNotificationAllowed (pure gate)', () => {
  test('gated kind respects the matching preference', () => {
    expect(isNotificationAllowed('TASK_ASSIGNED', { notifyTaskAssigned: false })).toBe(false)
    expect(isNotificationAllowed('TASK_ASSIGNED', { notifyTaskAssigned: true })).toBe(true)
    expect(isNotificationAllowed('TASK_STATUS_CHANGED', { notifyTaskStatusChanged: false })).toBe(false)
  })
  test('ungated kinds always allowed', () => {
    expect(isNotificationAllowed('TASK_COMMENTED', { notifyTaskAssigned: false })).toBe(true)
    expect(isNotificationAllowed('TASK_DUE_SOON', {})).toBe(true)
  })
  test('no/unset preferences → allowed (opt-out)', () => {
    expect(isNotificationAllowed('TASK_ASSIGNED', null)).toBe(true)
    expect(isNotificationAllowed('TASK_ASSIGNED', {})).toBe(true)
  })
})

describe('createNotification honours recipient preferences', () => {
  test('disabling notifyTaskAssigned suppresses TASK_ASSIGNED', async () => {
    await prisma.user.update({ where: { id: recipientId }, data: { preferences: { notifyTaskAssigned: false } } })
    await createNotification({
      recipientId,
      actorId: null,
      kind: 'TASK_ASSIGNED',
      title: 'assigned',
    })
    expect(await countFor('TASK_ASSIGNED')).toBe(0)
  })

  test('an ungated kind still delivers even when another toggle is off', async () => {
    await createNotification({ recipientId, actorId: null, kind: 'TASK_COMMENTED', title: 'commented' })
    expect(await countFor('TASK_COMMENTED')).toBe(1)
  })

  test('re-enabling notifyTaskAssigned delivers again', async () => {
    await prisma.user.update({ where: { id: recipientId }, data: { preferences: { notifyTaskAssigned: true } } })
    await createNotification({ recipientId, actorId: null, kind: 'TASK_ASSIGNED', title: 'assigned again' })
    expect(await countFor('TASK_ASSIGNED')).toBe(1)
  })
})
