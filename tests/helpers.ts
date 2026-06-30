import { prisma } from '../src/lib/db'
import { createApp } from '../src/app'

// Guard: tolak jika DATABASE_URL tidak mengarah ke DB test
// Jalankan test dengan: bun run test (sudah pakai --env-file .env.test)
const dbUrl = process.env.DATABASE_URL ?? ''
if (!dbUrl.includes('test')) {
  throw new Error(
    `[tests/helpers] DATABASE_URL tidak aman untuk test: "${dbUrl}"\n` +
      'Gunakan: bun run test  (atau bun --env-file .env.test test)\n' +
      'Setup DB test: bun run test:setup',
  )
}

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

/** Create a test project owned by the given user */
export async function seedTestProject(
  ownerId: string,
  name = 'Test Project',
) {
  return prisma.project.create({
    data: {
      name,
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      members: { create: { userId: ownerId, role: 'OWNER' } },
    },
  })
}

/** Create a single task in the given project */
export async function seedTestTask(
  projectId: string,
  reporterId: string,
  overrides: {
    title?: string
    status?: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    kind?: 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'
    assigneeId?: string | null
    dueAt?: Date | null
  } = {},
) {
  return prisma.task.create({
    data: {
      projectId,
      reporterId,
      title: overrides.title ?? 'Test Task',
      description: '',
      kind: overrides.kind ?? 'TASK',
      status: overrides.status ?? 'OPEN',
      priority: overrides.priority ?? 'MEDIUM',
      assigneeId: overrides.assigneeId ?? null,
      dueAt: overrides.dueAt ?? null,
    },
  })
}

/** Clean up test data */
export async function cleanupTestData() {
  await prisma.reportHistory.deleteMany()
  await prisma.event.deleteMany()
  await prisma.taskDependency.deleteMany()
  await prisma.taskTag.deleteMany()
  await prisma.taskChecklistItem.deleteMany()
  await prisma.taskStatusChange.deleteMany()
  await prisma.taskComment.deleteMany()
  await prisma.taskEvidence.deleteMany()
  await prisma.task.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.project.deleteMany()
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
}
