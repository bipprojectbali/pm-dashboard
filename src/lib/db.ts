import { PrismaClient } from '../../generated/prisma'
import { withSoftDelete } from './prisma-soft-delete'

// The soft-delete extension wraps every Task read to hide trashed rows; see
// prisma-soft-delete.ts. Extended clients carry a distinct type, so we cache
// that type on the global.
type ExtendedPrisma = ReturnType<typeof withSoftDelete>
const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrisma }

export const prisma =
  globalForPrisma.prisma ??
  withSoftDelete(
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    }),
  )

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
