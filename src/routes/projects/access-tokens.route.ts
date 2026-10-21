import Elysia from 'elysia'
import { prisma } from '../../lib/db'
import { generateProjectToken } from '../../lib/project-access-tokens'
import {
  canManageProject,
  canManageProjectNow,
  getIp,
  requireAuth,
  requireProjectMember,
} from '../../lib/route-helpers'
import { audit } from './shared'

const TOKEN_SELECT = {
  id: true,
  name: true,
  tokenPrefix: true,
  scope: true,
  status: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true, email: true, image: true } },
} as const

const EXPIRY_PRESETS = [7, 30, 90, 365] as const

// Tokens are project credentials — only OWNER/PM (or system admin) may list or
// manage them, narrowing to OWNER + system admin while the project is locked;
// the raw plaintext is returned exactly once on create.
export function projectAccessTokenRoutes() {
  return new Elysia()
    .get('/api/projects/:id/access-tokens', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      // Lock-aware raw role: listing tokens is a read the overdue lock must not
      // take from the people who already had it — but once locked that is only
      // the OWNER, since every other read of the project is already a 403 and
      // its credentials must not outlive it.
      const { allowed, locked } = await canManageProjectNow(params.id, auth)
      if (!allowed) {
        set.status = 403
        return locked
          ? {
              error: 'Project terkunci karena overdue — access token hanya bisa dilihat pemilik project atau admin',
              locked: true,
            }
          : { error: 'Only OWNER, PM, or system admin can view access tokens' }
      }
      const tokens = await prisma.projectAccessToken.findMany({
        where: { projectId: params.id },
        select: TOKEN_SELECT,
        orderBy: { createdAt: 'desc' },
      })
      return { tokens }
    })

    .post('/api/projects/:id/access-tokens', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can create access tokens' }
      }
      const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
      if (!project) { set.status = 404; return { error: 'Project not found' } }

      const body = (await request.json()) as { name?: string; scope?: string; expiresInDays?: number }
      const name = body.name?.trim()
      if (!name) { set.status = 400; return { error: 'name wajib diisi' } }
      const scope = body.scope === 'WRITE' ? 'WRITE' : 'READ'
      let expiresAt: Date | null = null
      if (body.expiresInDays != null) {
        if (!(EXPIRY_PRESETS as readonly number[]).includes(body.expiresInDays)) {
          set.status = 400
          return { error: `expiresInDays must be one of: ${EXPIRY_PRESETS.join(', ')}` }
        }
        expiresAt = new Date(Date.now() + body.expiresInDays * 86_400_000)
      }

      const { raw, hash, prefix } = generateProjectToken()
      const token = await prisma.projectAccessToken.create({
        data: {
          projectId: params.id,
          createdById: auth.userId,
          name,
          tokenHash: hash,
          tokenPrefix: prefix,
          scope,
          expiresAt,
        },
        select: TOKEN_SELECT,
      })
      audit(auth.userId, 'ACCESS_TOKEN_CREATED', `${params.id} ${token.id} scope=${scope}`, getIp(request))
      // raw is returned ONCE — never stored or retrievable again.
      return { token, raw }
    })

    .post('/api/projects/:id/access-tokens/:tokenId/revoke', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can revoke access tokens' }
      }
      const existing = await prisma.projectAccessToken.findFirst({
        where: { id: params.tokenId, projectId: params.id },
        select: { id: true },
      })
      if (!existing) { set.status = 404; return { error: 'Token not found' } }
      const token = await prisma.projectAccessToken.update({
        where: { id: params.tokenId },
        data: { status: 'REVOKED' },
        select: TOKEN_SELECT,
      })
      audit(auth.userId, 'ACCESS_TOKEN_REVOKED', `${params.id} ${params.tokenId}`, getIp(request))
      return { token }
    })

    .delete('/api/projects/:id/access-tokens/:tokenId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can delete access tokens' }
      }
      const existing = await prisma.projectAccessToken.findFirst({
        where: { id: params.tokenId, projectId: params.id },
        select: { id: true },
      })
      if (!existing) { set.status = 404; return { error: 'Token not found' } }
      await prisma.projectAccessToken.delete({ where: { id: params.tokenId } })
      audit(auth.userId, 'ACCESS_TOKEN_DELETED', `${params.id} ${params.tokenId}`, getIp(request))
      return { ok: true }
    })
}
