import { createAuthClient } from 'better-auth/client'

// Better Auth React client for use in frontend components.
// Used for Better Auth's own endpoints (sign-in/email, sign-out, sign-in/social).
// Custom endpoints (/api/auth/login, /api/auth/session) remain available via
// the existing apiFetch + useSession/useLogin/useLogout hooks in useAuth.ts.
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
})
