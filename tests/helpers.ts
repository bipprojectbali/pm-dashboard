import { prisma } from '../src/lib/db'
import { createApp } from '../src/app'

export { prisma }

export function createTestApp() {
  const app = createApp()
  return app
}

/** Create a test user with hashed password, returns the user record */
export async function seedTestUser(email = 'test@example.com', password = 'test123', name = 'Test User', role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'USER') {
  const hashed = await Bun.password.hash(password, { algorithm: 'bcrypt' })
  return prisma.user.upsert({
    where: { email },
    update: { name, password: hashed, role },
    create: { email, name, password: hashed, role },
  })
}

/** Create a session for a user, returns the token */
export async function createTestSession(userId: string, expiresAt?: Date) {
  const token = crypto.randomUUID()
  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt: expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
  return token
}

/** Clean up test data */
export async function cleanupTestData() {
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
}
