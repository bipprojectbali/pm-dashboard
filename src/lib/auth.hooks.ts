import { createAuthMiddleware } from 'better-auth/api'
import { appLog } from './applog'
import { prisma } from './db'
import { env } from './env'
import { redis } from './redis'

export const authSecondaryStorage = {
  get: async (key: string) => {
    const val = await redis.get(`ba:kv:${key}`)
    return val ?? null
  },
  set: async (key: string, value: string, ttl?: number) => {
    if (ttl) {
      await redis.setex(`ba:kv:${key}`, ttl, value)
    } else {
      await redis.set(`ba:kv:${key}`, value)
    }
  },
  delete: async (key: string) => {
    await redis.del(`ba:kv:${key}`)
  },
}

export const authDatabaseHooks = {
  session: {
    create: {
      // Block session creation for blocked users — fires before the session row is inserted.
      before: async (session: { userId: string }) => {
        const user = await prisma.user.findUnique({
          where: { id: session.userId },
          select: { blocked: true },
        })
        if (user?.blocked) {
          appLog('warn', `Blocked session creation for userId=${session.userId}`)
          return false as const
        }
      },
    },
  },
  user: {
    create: {
      // After OAuth signup, auto-promote SUPER_ADMIN if email matches the env list.
      after: async (user: { id: string; email: string }) => {
        if (
          env.SUPER_ADMIN_EMAILS.includes(user.email) &&
          (user as unknown as { role: string }).role !== 'SUPER_ADMIN'
        ) {
          await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN' } }).catch(() => {})
          appLog('info', `Auto-promoted ${user.email} to SUPER_ADMIN (Better Auth user create)`)
        }
      },
    },
  },
}

export const authAfterHook = createAuthMiddleware(async (ctx) => {
  const path = ctx.path as string
  if (path !== '/sign-in/email' && path !== '/sign-in/social' && path !== '/sign-out') {
    return
  }

  const getIp = (req: Request) =>
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'

  try {
    const ip = ctx.request ? getIp(ctx.request) : 'unknown'

    if (path === '/sign-in/email' || path === '/sign-in/social') {
      const returned = ctx.context.returned as { user?: { id?: string; email?: string; role?: string } } | undefined
      const userId = returned?.user?.id
      if (userId) {
        const provider = path === '/sign-in/social' ? 'via Google OAuth (Better Auth)' : 'via email (Better Auth)'
        await prisma.auditLog.create({ data: { userId, action: 'LOGIN', detail: provider, ip } }).catch(() => {})

        // SUPER_ADMIN auto-promotion on email login (redundant safety check alongside user.create.after)
        const userEmail = returned?.user?.email
        if (userEmail && env.SUPER_ADMIN_EMAILS.includes(userEmail) && returned?.user?.role !== 'SUPER_ADMIN') {
          await prisma.user.update({ where: { id: userId }, data: { role: 'SUPER_ADMIN' } }).catch(() => {})
          appLog('info', `Auto-promoted ${userEmail} to SUPER_ADMIN on Better Auth login`)
        }
      }
    } else if (path === '/sign-out') {
      const session = ctx.context.session as { user?: { id?: string } } | undefined
      const userId = session?.user?.id
      if (userId) {
        await prisma.auditLog
          .create({ data: { userId, action: 'LOGOUT', detail: 'Better Auth', ip } })
          .catch(() => {})
      }
    }
  } catch {
    // Audit errors must never break the auth flow
  }
})
