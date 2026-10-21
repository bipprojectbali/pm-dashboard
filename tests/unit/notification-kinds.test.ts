import { describe, expect, it } from 'bun:test'
import { NotificationKind } from '../../generated/prisma'
import { NOTIFICATION_KINDS } from '../../src/frontend/lib/notification-kinds'

describe('NOTIFICATION_KINDS', () => {
  it('matches the Prisma NotificationKind enum exactly', () => {
    expect([...NOTIFICATION_KINDS].sort()).toEqual(Object.values(NotificationKind).sort())
  })

  it('has no duplicates', () => {
    expect(new Set(NOTIFICATION_KINDS).size).toBe(NOTIFICATION_KINDS.length)
  })
})
