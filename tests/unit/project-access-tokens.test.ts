import { afterAll, describe, expect, test } from 'bun:test'
import { prisma } from '../../src/lib/db'
import { generateProjectToken, hashToken, verifyProjectToken } from '../../src/lib/project-access-tokens'

const createdIds: string[] = []
let projectId = ''

async function seedToken(opts: { scope?: 'READ' | 'WRITE'; status?: 'ACTIVE' | 'REVOKED'; expiresAt?: Date | null }) {
  if (!projectId) {
    const owner = await prisma.user.create({
      data: { email: `pat-unit-${crypto.randomUUID()}@test.com`, name: 'U', password: 'x', role: 'USER' },
    })
    const project = await prisma.project.create({
      data: { name: 'PAT unit', ownerId: owner.id, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE' },
    })
    projectId = project.id
  }
  const { raw, hash, prefix } = generateProjectToken()
  const token = await prisma.projectAccessToken.create({
    data: {
      projectId,
      name: 'unit',
      tokenHash: hash,
      tokenPrefix: prefix,
      scope: opts.scope ?? 'READ',
      status: opts.status ?? 'ACTIVE',
      expiresAt: opts.expiresAt ?? null,
    },
  })
  createdIds.push(token.id)
  return { raw, token }
}

afterAll(async () => {
  await prisma.projectAccessToken.deleteMany({ where: { id: { in: createdIds } } })
  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } })
    await prisma.project.delete({ where: { id: projectId } }).catch(() => {})
    if (p) await prisma.user.delete({ where: { id: p.ownerId } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe('generateProjectToken', () => {
  test('raw has pmt_ prefix and prefix is first 12 chars', () => {
    const { raw, prefix, hash } = generateProjectToken()
    expect(raw).toStartWith('pmt_')
    expect(prefix).toBe(raw.slice(0, 12))
    expect(hash).toBe(hashToken(raw))
  })

  test('hashToken is deterministic and 64 hex chars (SHA-256)', () => {
    const h = hashToken('pmt_example')
    expect(h).toBe(hashToken('pmt_example'))
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  test('two tokens are distinct', () => {
    expect(generateProjectToken().raw).not.toBe(generateProjectToken().raw)
  })
})

describe('verifyProjectToken', () => {
  test('valid ACTIVE token resolves scope + project + updates lastUsedAt', async () => {
    const { raw, token } = await seedToken({ scope: 'WRITE' })
    const res = await verifyProjectToken(raw)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.scope).toBe('WRITE')
      expect(res.projectId).toBe(projectId)
      expect(res.tokenId).toBe(token.id)
    }
    const row = await prisma.projectAccessToken.findUnique({ where: { id: token.id }, select: { lastUsedAt: true } })
    expect(row?.lastUsedAt).not.toBeNull()
  })

  test('non-pmt string → unauthorized', async () => {
    const res = await verifyProjectToken('bearer-nonsense')
    expect(res).toEqual({ ok: false, reason: 'unauthorized' })
  })

  test('unknown token → unauthorized', async () => {
    const res = await verifyProjectToken(`pmt_${'a'.repeat(40)}`)
    expect(res).toEqual({ ok: false, reason: 'unauthorized' })
  })

  test('revoked token → revoked', async () => {
    const { raw } = await seedToken({ status: 'REVOKED' })
    const res = await verifyProjectToken(raw)
    expect(res).toEqual({ ok: false, reason: 'revoked' })
  })

  test('expired token → expired', async () => {
    const { raw } = await seedToken({ expiresAt: new Date(Date.now() - 1000) })
    const res = await verifyProjectToken(raw)
    expect(res).toEqual({ ok: false, reason: 'expired' })
  })
})
