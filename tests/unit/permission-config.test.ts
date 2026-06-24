import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { setSetting } from '../../src/lib/app-settings'
import { prisma } from '../../src/lib/db'
import {
  getAllPermissionRules,
  getPermissionRule,
  invalidatePermissionCache,
  isValidPermissionKey,
  meetsMinProjectRole,
  parseAndValidateValue,
  PERMISSION_RULES,
  PROJECT_ROLE_ORDER,
} from '../../src/lib/permission-config'

async function reset() {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'permissions.' } } })
  invalidatePermissionCache()
}

beforeEach(reset)
afterEach(reset)

describe('permission-config registry', () => {
  test('4 rules tersedia', () => {
    expect(PERMISSION_RULES).toHaveLength(4)
    const keys = PERMISSION_RULES.map((r) => r.key)
    expect(keys).toContain('permissions.project.create.allowedRoles')
    expect(keys).toContain('permissions.project.delete.allowedProjectRoles')
    expect(keys).toContain('permissions.task.write.minProjectRole')
    expect(keys).toContain('permissions.task.delete.allowedProjectRoles')
  })

  test('setiap rule punya label, description, options, default', () => {
    for (const r of PERMISSION_RULES) {
      expect(r.label).toBeTruthy()
      expect(r.description).toBeTruthy()
      expect(r.options.length).toBeGreaterThan(0)
      expect(r.default.length).toBeGreaterThan(0)
    }
  })
})

describe('getPermissionRule — fallback ke default', () => {
  test('project.create default = ["ADMIN","SUPER_ADMIN"]', async () => {
    const v = await getPermissionRule('permissions.project.create.allowedRoles')
    expect(v).toEqual(['ADMIN', 'SUPER_ADMIN'])
  })

  test('project.delete default = ["OWNER"]', async () => {
    const v = await getPermissionRule('permissions.project.delete.allowedProjectRoles')
    expect(v).toEqual(['OWNER'])
  })

  test('task.write default = ["MEMBER"]', async () => {
    const v = await getPermissionRule('permissions.task.write.minProjectRole')
    expect(v).toEqual(['MEMBER'])
  })

  test('task.delete default = ["OWNER","PM"]', async () => {
    const v = await getPermissionRule('permissions.task.delete.allowedProjectRoles')
    expect(v).toEqual(['OWNER', 'PM'])
  })

  test('key tidak dikenal return array kosong', async () => {
    const v = await getPermissionRule('permissions.unknown.key')
    expect(v).toEqual([])
  })
})

describe('getAllPermissionRules — cache 60s', () => {
  test('return semua 4 keys', async () => {
    const all = await getAllPermissionRules()
    expect(Object.keys(all)).toHaveLength(4)
    for (const r of PERMISSION_RULES) {
      expect(all[r.key]).toBeDefined()
    }
  })

  test('setSetting invalidates cache', async () => {
    await getAllPermissionRules() // prime cache
    await setSetting('permissions.project.delete.allowedProjectRoles', JSON.stringify(['OWNER', 'PM']))
    // setSetting harus trigger invalidatePermissionCache
    const v = await getPermissionRule('permissions.project.delete.allowedProjectRoles')
    expect(v).toEqual(['OWNER', 'PM'])
  })
})

describe('parseAndValidateValue', () => {
  test('valid value berhasil', () => {
    const r = parseAndValidateValue(
      'permissions.project.create.allowedRoles',
      JSON.stringify(['ADMIN', 'SUPER_ADMIN']),
    )
    expect(r.ok).toBe(true)
    expect(r.value).toEqual(['ADMIN', 'SUPER_ADMIN'])
  })

  test('partial valid value berhasil', () => {
    const r = parseAndValidateValue(
      'permissions.project.delete.allowedProjectRoles',
      JSON.stringify(['OWNER', 'PM']),
    )
    expect(r.ok).toBe(true)
    expect(r.value).toEqual(['OWNER', 'PM'])
  })

  test('array kosong ditolak', () => {
    const r = parseAndValidateValue('permissions.project.create.allowedRoles', JSON.stringify([]))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('empty')
  })

  test('item invalid ditolak', () => {
    const r = parseAndValidateValue('permissions.project.create.allowedRoles', JSON.stringify(['USER', 'ADMIN']))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Invalid values')
    expect(r.error).toContain('USER')
  })

  test('bukan JSON array ditolak', () => {
    const r = parseAndValidateValue('permissions.project.create.allowedRoles', '"ADMIN"')
    expect(r.ok).toBe(false)
  })

  test('JSON invalid ditolak', () => {
    const r = parseAndValidateValue('permissions.project.create.allowedRoles', '{broken')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('JSON')
  })

  test('key tidak dikenal ditolak', () => {
    const r = parseAndValidateValue('permissions.unknown.key', JSON.stringify(['X']))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Unknown')
  })
})

describe('isValidPermissionKey', () => {
  test('key valid return true', () => {
    for (const r of PERMISSION_RULES) {
      expect(isValidPermissionKey(r.key)).toBe(true)
    }
  })

  test('key tidak dikenal return false', () => {
    expect(isValidPermissionKey('permissions.nope')).toBe(false)
    expect(isValidPermissionKey('')).toBe(false)
    expect(isValidPermissionKey('ADMIN')).toBe(false)
  })
})

describe('meetsMinProjectRole', () => {
  test('PROJECT_ROLE_ORDER terdefinisi', () => {
    expect(PROJECT_ROLE_ORDER.VIEWER).toBe(0)
    expect(PROJECT_ROLE_ORDER.MEMBER).toBe(1)
    expect(PROJECT_ROLE_ORDER.PM).toBe(2)
    expect(PROJECT_ROLE_ORDER.OWNER).toBe(3)
  })

  test('VIEWER tidak memenuhi min MEMBER', () => {
    expect(meetsMinProjectRole('VIEWER', ['MEMBER'])).toBe(false)
  })

  test('MEMBER memenuhi min MEMBER', () => {
    expect(meetsMinProjectRole('MEMBER', ['MEMBER'])).toBe(true)
  })

  test('OWNER memenuhi min MEMBER', () => {
    expect(meetsMinProjectRole('OWNER', ['MEMBER'])).toBe(true)
  })

  test('MEMBER tidak memenuhi min OWNER', () => {
    expect(meetsMinProjectRole('MEMBER', ['OWNER'])).toBe(false)
  })

  test('PM memenuhi min PM', () => {
    expect(meetsMinProjectRole('PM', ['PM'])).toBe(true)
  })
})
