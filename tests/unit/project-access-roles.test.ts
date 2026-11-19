// The lock carve-out is narrower than normal management on purpose: OWNER and
// PM run a healthy project but only a system admin may unfreeze an overdue one. These two predicates
// must therefore never be collapsed back into one.
import { describe, expect, test } from 'bun:test'
import { canDecideLockedProject, canManageProject } from '../../src/lib/project-access'

const user = { role: 'USER' }
const admin = { role: 'ADMIN' }
const superAdmin = { role: 'SUPER_ADMIN' }

describe('canManageProject — wewenang normal, PM tetap termasuk', () => {
  test('OWNER dan PM boleh, MEMBER/VIEWER/bukan anggota tidak', () => {
    expect(canManageProject(user, { role: 'OWNER' })).toBe(true)
    expect(canManageProject(user, { role: 'PM' })).toBe(true)
    expect(canManageProject(user, { role: 'MEMBER' })).toBe(false)
    expect(canManageProject(user, { role: 'VIEWER' })).toBe(false)
    expect(canManageProject(user, null)).toBe(false)
  })

  test('system admin lolos tanpa keanggotaan', () => {
    expect(canManageProject(admin, null)).toBe(true)
    expect(canManageProject(superAdmin, null)).toBe(true)
  })
})

describe('canDecideLockedProject — hanya system admin', () => {
  test('ADMIN dan SUPER_ADMIN boleh', () => {
    expect(canDecideLockedProject(admin)).toBe(true)
    expect(canDecideLockedProject(superAdmin)).toBe(true)
  })

  test('USER ditolak, apa pun peran project-nya (OWNER/PM tidak punya carve-out)', () => {
    expect(canDecideLockedProject(user)).toBe(false)
    // Argumen kedua sudah dihapus; kalau ada yang masih mengirim membership,
    // peran OWNER/PM tetap tidak boleh mengubah jawabannya.
    const legacy = canDecideLockedProject as (a: { role: string }, m?: { role: string } | null) => boolean
    expect(legacy(user, { role: 'OWNER' })).toBe(false)
    expect(legacy(user, { role: 'PM' })).toBe(false)
    expect(legacy(user, { role: 'MEMBER' })).toBe(false)
    expect(legacy(user, null)).toBe(false)
  })

  test('lebih sempit dari canManageProject, bukan sama', () => {
    for (const role of ['OWNER', 'PM']) {
      expect(canManageProject(user, { role })).toBe(true)
      expect(canDecideLockedProject(user)).toBe(false)
    }
  })
})
