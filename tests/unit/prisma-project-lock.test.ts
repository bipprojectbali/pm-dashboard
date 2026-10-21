import { afterEach, describe, expect, test } from 'bun:test'
import {
  beginLockActorScope,
  foreignKeysFromCreateData,
  GUARDED_MODELS,
  isGuardedWrite,
  isLockBypassed,
  isProjectLockedError,
  isSystemAdminActor,
  LOCKED_WRITE_MESSAGE,
  ProjectLockedError,
  recordLockActor,
  withLockBypass,
  WRITE_OPS,
} from '../../src/lib/prisma-project-lock'

const viaProject = { field: 'projectId', relation: 'project' }

describe('GUARDED_MODELS', () => {
  test('tiap spec punya field + relation, dan parent hanya untuk FK non-projectId', () => {
    for (const [model, spec] of Object.entries(GUARDED_MODELS)) {
      expect(spec.field, model).toBeTruthy()
      expect(spec.relation, model).toBeTruthy()
      if (spec.field === 'projectId') expect(spec.parent, model).toBeUndefined()
      else if (model !== 'project') expect(spec.parent, model).toBeTruthy()
    }
  })

  test('model yang sengaja dibiarkan terbuka tidak ikut dijaga', () => {
    // Menjaga salah satu dari ini akan membunuh fitur: notifikasi lock,
    // stamping lastUsedAt token, dan ingest webhook GitHub.
    for (const model of ['notification', 'projectAccessToken', 'projectGithubEvent', 'githubWebhookLog']) {
      expect(GUARDED_MODELS[model], model).toBeUndefined()
    }
  })

  test('project hanya dijaga pada update, bukan create/delete', () => {
    expect(isGuardedWrite('Project', 'update')).toBe(true)
    expect(isGuardedWrite('Project', 'delete')).toBe(false)
    expect(isGuardedWrite('Project', 'create')).toBe(false)
  })
})

describe('isGuardedWrite', () => {
  test('semua write op dijaga untuk model project-scoped', () => {
    for (const op of WRITE_OPS) expect(isGuardedWrite('Task', op), op).toBe(true)
  })

  test('read tidak pernah dijaga — agregasi lintas project harus tetap melihat data terkunci', () => {
    for (const op of ['findMany', 'findUnique', 'findFirst', 'count', 'aggregate', 'groupBy']) {
      expect(isGuardedWrite('Task', op), op).toBe(false)
    }
  })

  test('model global dan model tak dikenal lolos', () => {
    expect(isGuardedWrite('User', 'update')).toBe(false)
    expect(isGuardedWrite('AppSetting', 'upsert')).toBe(false)
    expect(isGuardedWrite(undefined, 'update')).toBe(false)
  })
})

describe('foreignKeysFromCreateData', () => {
  test('FK langsung, bentuk create tunggal', () => {
    expect(foreignKeysFromCreateData(viaProject, { data: { projectId: 'p1', title: 'x' } })).toEqual(['p1'])
  })

  test('createMany: tiap baris diresolve', () => {
    const args = { data: [{ projectId: 'p1' }, { projectId: 'p2' }] }
    expect(foreignKeysFromCreateData(viaProject, args)).toEqual(['p1', 'p2'])
  })

  test('nested connect dipakai saat FK tidak ditulis langsung', () => {
    const args = { data: { project: { connect: { id: 'p3' } } } }
    expect(foreignKeysFromCreateData(viaProject, args)).toEqual(['p3'])
  })

  test('upsert memakai cabang create', () => {
    expect(foreignKeysFromCreateData(viaProject, { where: { id: 't1' }, create: { projectId: 'p4' }, update: {} })).toEqual(
      ['p4'],
    )
  })

  test('tanpa FK yang bisa dibaca → kosong, bukan nilai palsu', () => {
    expect(foreignKeysFromCreateData(viaProject, { data: { title: 'x' } })).toEqual([])
    expect(foreignKeysFromCreateData(viaProject, {})).toEqual([])
  })
})

describe('ProjectLockedError', () => {
  const err = new ProjectLockedError({
    projectId: 'p1',
    projectName: 'Proyek A',
    stage: 'LOCKED',
    overdueDays: 30,
    model: 'taskComment',
    operation: 'create',
  })

  test('pesan menyertakan konteks operasi, bukan hanya teks generik', () => {
    expect(err.message).toContain(LOCKED_WRITE_MESSAGE)
    expect(err.message).toContain('taskComment.create')
    expect(err.message).toContain('p1')
    expect(err.message).toContain('overdue=30d')
  })

  test('membawa status 403 + locked untuk dipetakan onError', () => {
    expect(err.status).toBe(403)
    expect(err.locked).toBe(true)
    expect(err.context.projectId).toBe('p1')
  })

  test('isProjectLockedError berbasis nama, tahan instance modul ganda', () => {
    expect(isProjectLockedError(err)).toBe(true)
    const clone = Object.assign(new Error('x'), { name: 'ProjectLockedError' })
    expect(isProjectLockedError(clone)).toBe(true)
    expect(isProjectLockedError(new Error('boom'))).toBe(false)
    expect(isProjectLockedError(null)).toBe(false)
  })
})

describe('withLockBypass', () => {
  test('default tidak aktif', () => {
    expect(isLockBypassed()).toBe(false)
  })

  test('aktif di dalam scope, termasuk setelah await, dan mati setelahnya', async () => {
    const inside = await withLockBypass(async () => {
      await new Promise((r) => setTimeout(r, 1))
      return isLockBypassed()
    })
    expect(inside).toBe(true)
    expect(isLockBypassed()).toBe(false)
  })

  test('nesting tidak mematikan scope luar saat scope dalam selesai', async () => {
    const seen = await withLockBypass(async () => {
      await withLockBypass(async () => undefined)
      return isLockBypassed()
    })
    expect(seen).toBe(true)
  })

  test('error di dalam scope tidak meninggalkan bypass menyala', async () => {
    await expect(
      withLockBypass(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(isLockBypassed()).toBe(false)
  })
})

describe('isSystemAdminActor', () => {
  // Harus tetap test pertama di blok ini: menguji store yang belum pernah diisi.
  test('gagal tertutup saat tidak ada actor (cron, sweep, script, MCP stdio)', () => {
    expect(isSystemAdminActor()).toBe(false)
  })

  afterEach(() => recordLockActor(false))

  test('admin tercatat dan bertahan melewati await', async () => {
    recordLockActor(true)
    await new Promise((r) => setTimeout(r, 1))
    expect(isSystemAdminActor()).toBe(true)
  })

  test('non-admin menimpa admin sebelumnya', () => {
    recordLockActor(true)
    recordLockActor(false)
    expect(isSystemAdminActor()).toBe(false)
  })

  // Regresi: `enterWith` yang dipanggil setelah await TIDAK terlihat oleh
  // pemanggil yang sedang menunggunya — persis bentuk requireAuth (role baru
  // diketahui setelah query DB) dan route handler yang menunggunya. Scope per
  // request memegang objek yang dimutasi, supaya handler melihat jawabannya.
  test('actor yang dicatat setelah await terlihat oleh pemanggil yang menunggu', async () => {
    beginLockActorScope()
    async function authenticate() {
      await new Promise((r) => setTimeout(r, 1))
      recordLockActor(true)
    }
    await authenticate()
    expect(isSystemAdminActor()).toBe(true)
  })
})
