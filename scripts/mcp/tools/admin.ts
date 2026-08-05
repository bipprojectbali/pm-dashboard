import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { jsonText, type ToolModule } from './shared'

async function audit(userId: string | null, action: string, detail: string | null) {
  await prisma.auditLog.create({ data: { userId, action, detail, ip: 'mcp' } }).catch(() => {})
}

export const adminTools: ToolModule = {
  name: 'admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'admin_set_user_role',
      {
        title: 'Change user role',
        description: 'Set role to USER, QC, or ADMIN. SUPER_ADMIN promotion must be done via env.',
        inputSchema: {
          userId: z.string(),
          role: z.enum(['USER', 'QC', 'ADMIN']),
        },
      },
      async ({ userId, role }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        if (user.role === 'SUPER_ADMIN') return jsonText({ error: 'Cannot demote SUPER_ADMIN' })
        const updated = await prisma.user.update({
          where: { id: userId },
          data: { role },
          select: { id: true, email: true, role: true },
        })
        await audit(userId, 'MCP_ROLE_CHANGED', `${user.role} -> ${role}`)
        appLog('info', `MCP: role ${user.email} -> ${role}`)
        return jsonText({ ok: true, user: updated })
      },
    )

    server.registerTool(
      'admin_block_user',
      {
        title: 'Block user',
        description: 'Block a user and revoke all their sessions',
        inputSchema: {
          userId: z.string(),
          reason: z.string().optional(),
        },
      },
      async ({ userId, reason }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        await prisma.$transaction([
          prisma.user.update({ where: { id: userId }, data: { blocked: true } }),
          prisma.session.deleteMany({ where: { userId } }),
        ])
        await audit(userId, 'MCP_BLOCKED', reason ?? null)
        appLog('warn', `MCP: blocked ${user.email}`, reason)
        return jsonText({ ok: true, userId })
      },
    )

    server.registerTool(
      'admin_unblock_user',
      {
        title: 'Unblock user',
        description: 'Remove the blocked flag from a user',
        inputSchema: { userId: z.string() },
      },
      async ({ userId }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        await prisma.user.update({ where: { id: userId }, data: { blocked: false } })
        await audit(userId, 'MCP_UNBLOCKED', null)
        appLog('info', `MCP: unblocked ${user.email}`)
        return jsonText({ ok: true, userId })
      },
    )

    server.registerTool(
      'admin_revoke_sessions',
      {
        title: 'Revoke user sessions',
        description: 'Delete all sessions for a user (force logout everywhere)',
        inputSchema: { userId: z.string() },
      },
      async ({ userId }) => {
        const { count } = await prisma.session.deleteMany({ where: { userId } })
        await audit(userId, 'MCP_SESSIONS_REVOKED', `count: ${count}`)
        appLog('info', `MCP: revoked ${count} sessions for ${userId}`)
        return jsonText({ ok: true, revoked: count })
      },
    )

    server.registerTool(
      'admin_create_user',
      {
        title: 'Create user',
        description: 'Create a new user with hashed password',
        inputSchema: {
          name: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(6),
          role: z.enum(['USER', 'QC', 'ADMIN']).default('USER'),
        },
      },
      async ({ name, email, password, role }) => {
        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) return jsonText({ error: 'Email already registered' })
        const hashed = await Bun.password.hash(password)
        const user = await prisma.user.create({
          data: { name, email, password: hashed, role },
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        })
        await audit(user.id, 'MCP_USER_CREATED', `role: ${role}`)
        appLog('info', `MCP: created user ${email} (${role})`)
        return jsonText({ ok: true, user })
      },
    )

    server.registerTool(
      'admin_update_user_profile',
      {
        title: 'Update user display name',
        description:
          "Update a user's display name (mirrors the self-service PUT /api/me/profile a user drives from Settings).",
        inputSchema: {
          userId: z.string(),
          name: z.string().trim().min(1).max(100),
        },
      },
      async ({ userId, name }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        const updated = await prisma.user.update({
          where: { id: userId },
          data: { name },
          select: { id: true, email: true, name: true },
        })
        await audit(userId, 'MCP_PROFILE_UPDATED', `${user.name} -> ${name}`)
        appLog('info', `MCP: profile name updated for ${user.email}`)
        return jsonText({ ok: true, user: updated })
      },
    )

    server.registerTool(
      'admin_reset_password',
      {
        title: 'Reset password',
        description: 'Reset a user password (requires the new password). Revokes all sessions.',
        inputSchema: {
          userId: z.string(),
          newPassword: z.string().min(6),
          revokeSessions: z.boolean().default(true),
        },
      },
      async ({ userId, newPassword, revokeSessions }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        const hashed = await Bun.password.hash(newPassword)
        await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
        let revoked = 0
        if (revokeSessions) {
          const { count } = await prisma.session.deleteMany({ where: { userId } })
          revoked = count
        }
        await audit(userId, 'MCP_PASSWORD_RESET', `sessions revoked: ${revoked}`)
        appLog('warn', `MCP: password reset for ${user.email}`)
        return jsonText({ ok: true, userId, sessionsRevoked: revoked })
      },
    )
  },
}
