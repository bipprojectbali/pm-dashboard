import { betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './db'
import { env } from './env'
import { redis } from './redis'
import { appLog } from './applog'

// ─── Bun.password compatibility adapter ─────────────────────────────────────
// Existing users have bcrypt hashes in User.password (via Bun.password.hash).
// Better Auth stores credential passwords in Account.password.
// We override hash/verify to use Bun.password (bcrypt) so existing hashes work.
const bunPasswordAdapter = {
  hash: (password: string) => Bun.password.hash(password, { algorithm: 'bcrypt' }),
  verify: async ({ hash, password }: { hash: string; password: string }) =>
    Bun.password.verify(password, hash),
}

// ─── Better Auth configuration ────────────────────────────────────────────────
export const auth = betterAuth({
  appName: 'pm-dashboard',

  // baseURL is used for OAuth callback redirect_uri construction
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  // ─── Database ──────────────────────────────────────────────────────────────
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  // ─── Advanced: cookie + ID config ─────────────────────────────────────────
  advanced: {
    // Keep cookie name as "session" — all 30+ backend endpoints parse `session=` cookie.
    // This preserves 100% backward compatibility with existing session handling.
    // The cookies map key must match Better Auth's internal key: "session_token".
    cookies: {
      session_token: {
        name: 'session',
        attributes: {
          httpOnly: true,
          sameSite: env.NODE_ENV === 'production' ? ('strict' as const) : ('lax' as const),
          secure: env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 7, // 7 days
        },
      },
    },
    database: {
      // Use UUID v4 matching existing primary key format
      generateId: () => crypto.randomUUID(),
    },
  },

  // ─── Session ───────────────────────────────────────────────────────────────
  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days TTL (matches SESSION_TTL_SEC)
    updateAge: 60 * 60 * 24,       // Sliding: refresh if session is >1 day old
    // Force session rows into the DB even when secondaryStorage (Redis) is configured.
    // Without this, Better Auth stores sessions only in Redis and the custom
    // GET /api/auth/session endpoint (which queries the DB) always returns 401.
    storeSessionInDatabase: true,
    // cookieCache disabled — forces DB lookup on every getSession() call.
    // Required so blocked user check always fires (can't trust cached data).
    cookieCache: {
      enabled: false,
    },
  },

  // ─── Email + Password ──────────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Use Bun.password (bcrypt) so new signups and existing password hashes are compatible.
    password: bunPasswordAdapter,
  },

  // ─── Social providers ──────────────────────────────────────────────────────
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // Sync Google profile picture to User.image on every sign-in.
      overrideUserInfoOnSignIn: true,
    },
  },

  // ─── User additional fields ────────────────────────────────────────────────
  // Maps existing DB columns in the `user` table to Better Auth's user object.
  user: {
    additionalFields: {
      role: {
        type: 'string' as const,
        defaultValue: 'USER',
        input: false,    // not settable by client requests
        returned: true,  // included in session.user response (server-readable)
      },
      blocked: {
        type: 'boolean' as const,
        defaultValue: false,
        input: false,
        returned: true,  // exposed in getSession() so requireAuth() can check it
      },
    },
  },

  // ─── Redis-backed rate limiting ────────────────────────────────────────────
  // 10 requests per 15-minute window, stored in Redis under "ba:kv:" prefix.
  // Disabled in test/development environments — enabled only in production.
  rateLimit: {
    enabled: env.NODE_ENV === 'production',
    window: 15 * 60,  // 15 minutes
    max: 10,
    storage: 'secondary-storage' as const,
  },

  // Secondary storage (Redis) for rate limiting and verification tokens.
  secondaryStorage: {
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
  },

  // ─── Database hooks ────────────────────────────────────────────────────────
  databaseHooks: {
    session: {
      create: {
        // Block session creation for blocked users.
        // Fires before the session row is inserted, for both email and OAuth logins.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { blocked: true },
          })
          if (user?.blocked) {
            appLog('warn', `Blocked session creation for userId=${session.userId}`)
            // Returning false aborts session creation → login returns error
            return false as const
          }
        },
      },
    },
    user: {
      create: {
        // After a new user is created (OAuth signup), auto-promote SUPER_ADMIN if email matches.
        after: async (user) => {
          if (
            env.SUPER_ADMIN_EMAILS.includes(user.email) &&
            (user as unknown as { role: string }).role !== 'SUPER_ADMIN'
          ) {
            await prisma.user
              .update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN' } })
              .catch(() => {})
            appLog('info', `Auto-promoted ${user.email} to SUPER_ADMIN (Better Auth user create)`)
          }
        },
      },
    },
  },

  // ─── Request/response hooks for audit logging ──────────────────────────────
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const path = ctx.path as string
      if (path !== '/sign-in/email' && path !== '/sign-in/social' && path !== '/sign-out') {
        return
      }

      const getIp = (req: Request) =>
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        'unknown'

      try {
        const ip = ctx.request ? getIp(ctx.request) : 'unknown'

        if (path === '/sign-in/email' || path === '/sign-in/social') {
          // Audit successful login via Better Auth
          const returned = ctx.context.returned as { user?: { id?: string; email?: string; role?: string } } | undefined
          const userId = returned?.user?.id
          if (userId) {
            const provider = path === '/sign-in/social' ? 'via Google OAuth (Better Auth)' : 'via email (Better Auth)'
            await prisma.auditLog
              .create({ data: { userId, action: 'LOGIN', detail: provider, ip } })
              .catch(() => {})

            // SUPER_ADMIN auto-promotion on email login (redundant safety check)
            const userEmail = returned?.user?.email
            if (userEmail && env.SUPER_ADMIN_EMAILS.includes(userEmail) && returned?.user?.role !== 'SUPER_ADMIN') {
              await prisma.user
                .update({ where: { id: userId }, data: { role: 'SUPER_ADMIN' } })
                .catch(() => {})
              appLog('info', `Auto-promoted ${userEmail} to SUPER_ADMIN on Better Auth login`)
            }
          }
        } else if (path === '/sign-out') {
          // Audit logout — session is in ctx.context.session before deletion
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
    }),
  },
})

export type Auth = typeof auth
