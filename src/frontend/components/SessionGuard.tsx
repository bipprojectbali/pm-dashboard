import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { UnauthorizedError, useSession } from '@/frontend/hooks/useAuth'

const AUTH_PATHS = new Set(['/', '/login', '/blocked'])

// Mounted in __root.tsx — runs on every route.
// Detects session expiry two ways:
//   1. Session poll (every 5 min) returns 401 → UnauthorizedError
//   2. Session query resolves with user: null (session deleted server-side)
// In both cases: clear query cache, redirect to /login.
export function SessionGuard() {
  const { error, data } = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const redirecting = useRef(false)

  useEffect(() => {
    if (AUTH_PATHS.has(pathname) || redirecting.current) return

    // Only redirect on explicit 401 (UnauthorizedError from apiFetch).
    // Intentionally NOT redirecting on data.user === null — that path is
    // only hit when logout runs (which already navigates) or when the
    // session endpoint returns 200 with no user (handled by beforeLoad).
    if (!(error instanceof UnauthorizedError)) return

    redirecting.current = true
    qc.clear()
    navigate({ to: '/login' }).finally(() => {
      redirecting.current = false
    })
  }, [error, data, pathname, navigate, qc])

  return null
}
