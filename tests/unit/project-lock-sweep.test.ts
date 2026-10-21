import { describe, expect, test } from 'bun:test'
import { computeLockState, type LockStage } from '../../src/lib/project-lock'
import { messageForStage, recipientsForStage, stageKind } from '../../src/lib/project-lock.sweep'

const OWNER = 'u-owner'
const PM = 'u-pm'
const MEMBER = 'u-member'
const VIEWER = 'u-viewer'
const ADMINS = ['u-admin-1', 'u-admin-2']

const project = {
  ownerId: OWNER,
  members: [
    { userId: OWNER, role: 'OWNER' },
    { userId: PM, role: 'PM' },
    { userId: MEMBER, role: 'MEMBER' },
    { userId: VIEWER, role: 'VIEWER' },
  ],
}

function sorted(stage: LockStage) {
  return recipientsForStage(project, stage, ADMINS).sort()
}

describe('stageKind', () => {
  test('memetakan hanya stage yang memicu notifikasi', () => {
    expect(stageKind('DUE_SOON')).toBe('PROJECT_DUE_SOON')
    expect(stageKind('OVERDUE')).toBe('PROJECT_OVERDUE')
    expect(stageKind('ESCALATED')).toBe('PROJECT_LOCK_WARNING')
    expect(stageKind('LOCKED')).toBe('PROJECT_LOCKED')
    expect(stageKind('ON_TIME')).toBeNull()
    expect(stageKind('EXEMPT')).toBeNull()
  })
})

describe('recipientsForStage', () => {
  test('EXEMPT / ON_TIME tidak mengirim ke siapa pun', () => {
    expect(recipientsForStage(project, 'EXEMPT', ADMINS)).toEqual([])
    expect(recipientsForStage(project, 'ON_TIME', ADMINS)).toEqual([])
  })

  test('DUE_SOON & OVERDUE hanya owner + OWNER/PM, tanpa system admin', () => {
    for (const stage of ['DUE_SOON', 'OVERDUE'] as LockStage[]) {
      expect(sorted(stage)).toEqual([OWNER, PM].sort())
    }
  })

  test('ESCALATED menambahkan system admin tanpa menambah MEMBER/VIEWER', () => {
    expect(sorted('ESCALATED')).toEqual([OWNER, PM, ...ADMINS].sort())
  })

  test('LOCKED menyasar semua anggota + owner + system admin', () => {
    expect(sorted('LOCKED')).toEqual([OWNER, PM, MEMBER, VIEWER, ...ADMINS].sort())
  })

  test('owner yang bukan baris member tetap masuk, tanpa duplikat', () => {
    const detached = { ownerId: 'u-detached', members: [{ userId: PM, role: 'PM' }] }
    const ids = recipientsForStage(detached, 'OVERDUE', ADMINS)
    expect(ids.sort()).toEqual(['u-detached', PM].sort())
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('tanpa system admin, ESCALATED tetap jalan ke OWNER/PM', () => {
    expect(sorted('ESCALATED')).toContain(PM)
    expect(recipientsForStage(project, 'ESCALATED', [])).toContain(OWNER)
  })
})

describe('messageForStage', () => {
  const base = { status: 'ACTIVE', archivedAt: null }
  const now = new Date('2026-10-21T00:00:00.000Z')
  const grace = 7

  function lockAt(offsetDays: number) {
    return computeLockState({ ...base, endsAt: new Date(now.getTime() + offsetDays * 86_400_000) }, grace, now)
  }

  test('DUE_SOON menyebut sisa hari dan tanggal lock', () => {
    const msg = messageForStage({ name: 'Proyek A' }, lockAt(3))
    expect(msg?.title).toContain('Proyek A')
    expect(msg?.title).toContain('3 hari')
    expect(msg?.body).toContain('read-only')
  })

  test('OVERDUE menyebut jumlah hari terlambat dan jalan keluarnya', () => {
    const msg = messageForStage({ name: 'Proyek B' }, lockAt(-2))
    expect(msg?.title).toContain('2 hari')
    expect(msg?.body).toContain('Perpanjang deadline')
  })

  test('ESCALATED menyebut sisa hari sebelum terkunci', () => {
    const state = lockAt(-5)
    expect(state.stage).toBe('ESCALATED')
    expect(messageForStage({ name: 'Proyek C' }, state)?.title).toContain('2 hari')
  })

  test('LOCKED menyebut ketiga jalan keluar', () => {
    const state = lockAt(-9)
    expect(state.locked).toBe(true)
    const body = messageForStage({ name: 'Proyek D' }, state)?.body ?? ''
    expect(body).toContain('diperpanjang')
    expect(body).toContain('selesai')
    expect(body).toContain('dibatalkan')
  })

  test('stage tanpa notifikasi tidak menghasilkan pesan', () => {
    expect(messageForStage({ name: 'Proyek E' }, lockAt(40))).toBeNull()
    expect(messageForStage({ name: 'Proyek F' }, computeLockState({ ...base, endsAt: null }, grace, now))).toBeNull()
  })
})
