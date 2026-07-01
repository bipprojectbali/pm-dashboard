import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { generateProjectToken } from '../../../src/lib/project-access-tokens'
import { resolveUserEmail } from './projects.helpers'
import { jsonText, type ToolModule } from './shared'

async function audit(userId: string | null, action: string, detail: string | null) {
  await prisma.auditLog.create({ data: { userId, action, detail, ip: 'mcp' } }).catch(() => {})
}

const TOKEN_SELECT = {
  id: true,
  name: true,
  tokenPrefix: true,
  scope: true,
  status: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
} as const

export const accessTokensReadonly: ToolModule = {
  name: 'access-tokens-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'access_token_list',
      {
        title: 'List project access tokens',
        description:
          'List a project\'s access tokens (per-user, project-scoped bearer tokens for agents). Never returns the hash or plaintext.',
        inputSchema: { projectId: z.string() },
      },
      async ({ projectId }) => {
        const tokens = await prisma.projectAccessToken.findMany({
          where: { projectId },
          select: TOKEN_SELECT,
          orderBy: { createdAt: 'desc' },
        })
        return jsonText({ count: tokens.length, tokens })
      },
    )
  },
}

export const accessTokensTools: ToolModule = {
  name: 'access-tokens',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'access_token_create',
      {
        title: 'Create project access token',
        description:
          'Create a project-scoped access token. Returns the raw token ONCE — it cannot be retrieved again. scope WRITE allows updates, READ is read-only.',
        inputSchema: {
          projectId: z.string(),
          name: z.string().min(1).max(100),
          scope: z.enum(['READ', 'WRITE']).default('READ'),
          expiresInDays: z.number().int().positive().optional(),
          actorEmail: z.string().email().optional().describe('Records this user as the token creator'),
        },
      },
      async ({ projectId, name, scope, expiresInDays, actorEmail }) => {
        const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
        if (!project) return jsonText({ error: `Project not found: ${projectId}` })
        let createdById: string | null = null
        if (actorEmail) {
          const u = await resolveUserEmail(actorEmail)
          if (!u) return jsonText({ error: `User not found: ${actorEmail}` })
          createdById = u.id
        }
        const { raw, hash, prefix } = generateProjectToken()
        const token = await prisma.projectAccessToken.create({
          data: {
            projectId,
            createdById,
            name,
            tokenHash: hash,
            tokenPrefix: prefix,
            scope,
            expiresAt: expiresInDays != null ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
          },
          select: TOKEN_SELECT,
        })
        await audit(createdById, 'MCP_ACCESS_TOKEN_CREATED', `${projectId} ${token.id} scope=${scope}`)
        return jsonText({
          ok: true,
          token,
          raw,
          warning: 'Simpan `raw` sekarang — token tidak bisa dilihat lagi setelah ini.',
        })
      },
    )

    server.registerTool(
      'access_token_revoke',
      {
        title: 'Revoke project access token',
        description: 'Permanently revoke an access token so it can no longer authenticate.',
        inputSchema: { tokenId: z.string() },
      },
      async ({ tokenId }) => {
        const existing = await prisma.projectAccessToken.findUnique({ where: { id: tokenId }, select: { id: true } })
        if (!existing) return jsonText({ error: `Token not found: ${tokenId}` })
        const token = await prisma.projectAccessToken.update({
          where: { id: tokenId },
          data: { status: 'REVOKED' },
          select: { ...TOKEN_SELECT, projectId: true },
        })
        await audit(null, 'MCP_ACCESS_TOKEN_REVOKED', `${token.projectId} ${tokenId}`)
        return jsonText({ ok: true, token })
      },
    )
  },
}
