// Fire-and-forget audit-trail writer (never blocks or throws on the caller).
import { prisma } from './db'

export function writeAuditLog(userId: string | null, action: string, detail: string | null, ip: string): void {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}
