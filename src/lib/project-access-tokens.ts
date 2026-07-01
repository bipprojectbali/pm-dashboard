import crypto from 'node:crypto'
import { prisma } from './db'

// Raw token layout: `pmt_<base64url(32 random bytes)>`. Only the SHA-256 hash is
// persisted (`tokenHash`), so the plaintext is unrecoverable after creation.
// `prefix` (first 12 chars) is stored plaintext purely to identify a token in the UI.
export function generateProjectToken(): { raw: string; hash: string; prefix: string } {
  const raw = `pmt_${crypto.randomBytes(32).toString('base64url')}`
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) }
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export type ProjectTokenScope = 'READ' | 'WRITE'

export type ProjectTokenVerifyResult =
  | { ok: true; tokenId: string; projectId: string; userId: string | null; scope: ProjectTokenScope }
  | { ok: false; reason: 'unauthorized' | 'revoked' | 'expired' }

// Resolve a raw bearer token to its project/user/scope context. Written now so
// Tahap 2 auth middleware can consume it; exercised by the lib unit test.
export async function verifyProjectToken(raw: string): Promise<ProjectTokenVerifyResult> {
  if (!raw || !raw.startsWith('pmt_')) return { ok: false, reason: 'unauthorized' }

  const token = await prisma.projectAccessToken.findUnique({ where: { tokenHash: hashToken(raw) } })
  if (!token) return { ok: false, reason: 'unauthorized' }
  if (token.status === 'REVOKED') return { ok: false, reason: 'revoked' }
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' }

  await prisma.projectAccessToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
  return {
    ok: true,
    tokenId: token.id,
    projectId: token.projectId,
    userId: token.createdById,
    scope: token.scope,
  }
}
