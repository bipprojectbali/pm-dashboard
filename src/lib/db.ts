import { PrismaClient } from '../../generated/prisma'
import { withProjectLock } from './prisma-project-lock'
import { withSoftDelete } from './prisma-soft-delete'

// Two query extensions, composed once here:
//   • soft-delete — hides trashed Task rows from reads (prisma-soft-delete.ts)
//   • project-overdue-lock — refuses writes to a locked project, unless inside
//     `withLockBypass` (prisma-project-lock.ts)
// Extended clients carry a distinct type, so we cache that type on the global.
type ExtendedPrisma = ReturnType<typeof buildClient>
const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrisma }

function buildClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
  // `base` is handed to the lock guard on purpose: its own lookups must not go
  // back through the extensions (recursion, and trashed rows must stay visible
  // to it). See withProjectLock's doc comment.
  return withProjectLock(withSoftDelete(base), base)
}

export const prisma = globalForPrisma.prisma ?? buildClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
