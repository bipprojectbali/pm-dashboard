// The lock carve-out is narrower than normal management on purpose: PM runs a
// healthy project but may not unfreeze an overdue one. These two predicates
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

describe('canDecideLockedProject — carve-out kunci, PM dicabut', () => {
  test('hanya OWNER di antara peran project', () => {
    expect(canDecideLockedProject(user, { role: 'OWNER' })).toBe(true)
    expect(canDecideLockedProject(user, { role: 'PM' })).toBe(false)
    expect(canDecideLockedProject(user, { role: 'MEMBER' })).toBe(false)
    expect(canDecideLockedProject(user, { role: 'VIEWER' })).toBe(false)
    expect(canDecideLockedProject(user, null)).toBe(false)
  })

  test('system admin tidak terpengaruh', () => {
    expect(canDecideLockedProject(admin, null)).toBe(true)
    expect(canDecideLockedProject(superAdmin, { role: 'PM' })).toBe(true)
  })

  test('lebih sempit dari canManageProject, bukan sama', () => {
    expect(canManageProject(user, { role: 'PM' })).toBe(true)
    expect(canDecideLockedProject(user, { role: 'PM' })).toBe(false)
  })
})
