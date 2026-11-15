import { APIError, createAuthMiddleware } from 'better-auth/api'
import { appLog } from './applog'
import { prisma } from './db'
import { env } from './env'
import { redis } from './redis'
import { resolveSignupDecision, SIGNUP_CLOSED_MESSAGE } from './signup-allowlist'

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
      // Signup gate. This is the chokepoint both unauthenticated doors funnel
      // through — email/password sign-up (internalAdapter.createUser) and Google
      // OAuth first sign-in (internalAdapter.createOAuthUser) both reach the
      // user row via the same createWithHooks(data, 'user') call, so one guard
      // here closes both. Throwing APIError rather than returning `false`:
      // `false` merely makes the insert return null, which surfaces as Better
      // Auth's own generic 400 "failed to create user" on the email path and as
      // a TypeError-turned-"unable to create user" redirect on the OAuth path.
      before: async (user: { email?: string }) => {
        const decision = await resolveSignupDecision(user.email)
        if (decision.allowed) return
        // appLog masks email-shaped substrings at the sink, so the attempted
        // address is safe to include and useful for spotting probing.
        await appLog(
          'warn',
          `Rejected account creation for ${user.email ?? '(no email)'} — signup allowlist closed (entries=${decision.entryCount})`,
        ).catch(() => {})
        throw new APIError('FORBIDDEN', { message: SIGNUP_CLOSED_MESSAGE })
      },
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
        await prisma.auditLog.create({ data: { userId, action: 'LOGOUT', detail: 'Better Auth', ip } }).catch(() => {})
      }
    }
  } catch {
    // Audit errors must never break the auth flow
  }
})
