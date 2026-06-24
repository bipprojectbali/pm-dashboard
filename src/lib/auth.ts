import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './db'
import { env } from './env'
import { authAfterHook, authDatabaseHooks, authSecondaryStorage } from './auth.hooks'

// Existing users have bcrypt hashes in User.password (via Bun.password.hash).
// Better Auth stores credential passwords in Account.password.
// We override hash/verify to use Bun.password (bcrypt) so existing hashes work.
const bunPasswordAdapter = {
  hash: (password: string) => Bun.password.hash(password, { algorithm: 'bcrypt' }),
  verify: async ({ hash, password }: { hash: string; password: string }) => Bun.password.verify(password, hash),
}

export const auth = betterAuth({
  appName: 'pm-dashboard',

  // baseURL is used for OAuth callback redirect_uri construction
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  advanced: {
    // Keep cookie name as "session" — all 30+ backend endpoints parse `session=` cookie.
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

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days TTL
    updateAge: 60 * 60 * 24, // Sliding: refresh if session is >1 day old
    // Force session rows into DB even when secondaryStorage (Redis) is configured —
    // otherwise GET /api/auth/session (which queries the DB) always returns 401.
    storeSessionInDatabase: true,
    // cookieCache disabled — forces DB lookup so blocked-user check always fires.
    cookieCache: {
      enabled: false,
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Use Bun.password (bcrypt) so new signups and existing password hashes are compatible.
    password: bunPasswordAdapter,
  },

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // Sync Google profile picture to User.image on every sign-in.
      overrideUserInfoOnSignIn: true,
    },
  },

  // Maps existing DB columns in the `user` table to Better Auth's user object.
  user: {
    additionalFields: {
      role: {
        type: 'string' as const,
        defaultValue: 'USER',
        input: false, // not settable by client requests
        returned: true, // included in session.user response (server-readable)
      },
      blocked: {
        type: 'boolean' as const,
        defaultValue: false,
        input: false,
        returned: true, // exposed in getSession() so requireAuth() can check it
      },
    },
  },

  // 10 requests per 15-minute window via Redis. Disabled outside production.
  rateLimit: {
    enabled: env.NODE_ENV === 'production',
    window: 15 * 60,
    max: 10,
    storage: 'secondary-storage' as const,
  },

  secondaryStorage: authSecondaryStorage,
  databaseHooks: authDatabaseHooks,
  hooks: { after: authAfterHook },
})

export type Auth = typeof auth
