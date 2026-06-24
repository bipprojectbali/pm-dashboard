import { prisma } from '../../../src/lib/db'

export async function audit(userId: string | null, action: string, detail: string | null) {
  await prisma.auditLog.create({ data: { userId, action, detail, ip: 'mcp' } }).catch(() => {})
}

export async function resolveUserEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, role: true } })
}
