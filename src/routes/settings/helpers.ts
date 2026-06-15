import { prisma } from '../../lib/db'
import { extractSessionToken, isSystemAdmin } from '../../lib/route-helpers'

export const SENSITIVE_KEYS = ['ai.anthropicApiKey', 'telegram.botToken']

export function maskSensitive(settings: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    result[key] = SENSITIVE_KEYS.includes(key) && value ? '***' : value
  }
  return result
}

export async function getAdminUser(request: Request) {
  const cookie = request.headers.get('cookie') ?? ''
  const token = extractSessionToken(cookie)
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, role: true } } },
  })
  if (!session || session.expiresAt < new Date() || !isSystemAdmin(session.user.role)) return null
  return session.user
}

export function hasMcpSecretAuth(request: Request): boolean {
  const secret = process.env.MCP_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false
  const provided = header.slice('Bearer '.length).trim()
  if (provided.length !== secret.length) return false
  let mismatch = 0
  for (let i = 0; i < provided.length; i++) mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i)
  return mismatch === 0
}
