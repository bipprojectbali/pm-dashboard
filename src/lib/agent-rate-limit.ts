import { redis } from './redis'

const RATE_LIMIT = 100
const WINDOW_SECONDS = 60

// Fixed-window rate limiter for the token-only /api/agent/* surface.
// Keyed by the first 12 chars of the raw pmt_ token (same as tokenPrefix).
// Sessions and non-pmt_ Authorization headers are always passed through.
export async function checkAgentRateLimit(
  request: Request,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const auth = request.headers.get('Authorization') ?? ''
  const raw = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!raw.startsWith('pmt_')) return { ok: true }
  const prefix = raw.slice(0, 12)
  const key = `agent:rl:${prefix}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, WINDOW_SECONDS)
  return count > RATE_LIMIT ? { ok: false, retryAfter: WINDOW_SECONDS } : { ok: true }
}
