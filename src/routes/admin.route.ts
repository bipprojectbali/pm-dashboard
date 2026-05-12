import { Elysia } from 'elysia'
import { prisma } from '../lib/db'
import { env } from '../lib/env'
import { appLog, clearAppLogs, getAppLogs } from '../lib/applog'
import {
  computeAdminOverview,
  computeAnalytics,
  computeProjectHealth,
  computeRiskReport,
  computeTeamLoad,
} from '../lib/admin-overview'
import { computePhantomWork, computeTaskEffort, detectGhostTasks, effortReport } from '../lib/effort'
import { addConnection, broadcastToAdmins, emitInvalidate, getOnlineUserIds, removeConnection } from '../lib/presence'
import { redis } from '../lib/redis'
import { parseSchema } from '../lib/schema-parser'
import { AI_QUEUE_TAG, clearSelfProject, ensureAiQueueTag, getSelfProject, setSelfProject } from '../lib/self-project'
import { generateWebhookToken } from '../lib/webhook-tokens'
import {
  extractSessionToken,
  getIp,
  isSystemAdmin,
  requireAuth,
} from '../lib/route-helpers'
import { ROUTES_METADATA } from '../lib/routes-metadata'

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

export function adminRoutes() {
  return new Elysia()

    // ─── Admin Users API ──────────────────────────────────
    .get('/api/admin/users', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || !isSystemAdmin(session.user.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
        orderBy: { createdAt: 'asc' },
      })
      return { users }
    })

    .put('/api/admin/users/:id/role', async ({ request, params, set }) => {
      const ip = getIp(request)
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { id: true, role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      if (session.user.id === params.id) {
        set.status = 400
        return { error: 'Tidak bisa mengubah role sendiri' }
      }
      const { role } = (await request.json()) as { role: string }
      if (!['USER', 'QC', 'ADMIN'].includes(role)) {
        set.status = 400
        return { error: 'Role tidak valid (USER, QC, atau ADMIN)' }
      }
      const target = await prisma.user.findUnique({ where: { id: params.id }, select: { email: true, role: true } })
      if (target?.role === 'SUPER_ADMIN') {
        set.status = 400
        return { error: 'Tidak bisa mengubah role SUPER_ADMIN' }
      }
      const user = await prisma.user.update({
        where: { id: params.id },
        data: { role: role as 'USER' | 'QC' | 'ADMIN' },
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
      })
      audit(params.id, 'ROLE_CHANGED', `${target?.role} → ${role} by ${session.user.id}`, ip)
      appLog('info', `Role changed: ${user.email} ${target?.role} → ${role}`)
      return { user }
    })

    .put('/api/admin/users/:id/block', async ({ request, params, set }) => {
      const ip = getIp(request)
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { id: true, role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      if (session.user.id === params.id) {
        set.status = 400
        return { error: 'Tidak bisa memblokir diri sendiri' }
      }
      const { blocked } = (await request.json()) as { blocked: boolean }
      const user = await prisma.user.update({
        where: { id: params.id },
        data: { blocked },
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
      })
      if (blocked) {
        await prisma.session.deleteMany({ where: { userId: params.id } })
      }
      const action = blocked ? 'BLOCKED' : 'UNBLOCKED'
      audit(params.id, action, `by ${session.user.id}`, ip)
      appLog('info', `User ${action.toLowerCase()}: ${user.email}`)
      return { user }
    })

    // ─── WebSocket Presence ──────────────────────────────
    .ws('/ws/presence', {
      async open(ws) {
        const cookie = ws.data.headers?.cookie ?? ''
        const token = (cookie as string).match(/session=([^;]+)/)?.[1]
        if (!token) {
          ws.close(4001, 'Unauthorized')
          return
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { id: true, role: true } } },
        })
        if (!session || session.expiresAt < new Date()) {
          ws.close(4001, 'Unauthorized')
          return
        }
        const isAdmin = session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN'
        ;(ws.data as unknown as { userId: string }).userId = session.user.id
        addConnection(ws as any, session.user.id, isAdmin)
      },
      close(ws) {
        removeConnection(ws as any)
      },
      message() {
        // No client messages expected
      },
    })

    // ─── Presence REST (for initial load) ──────────────
    .get('/api/admin/presence', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      return { online: getOnlineUserIds() }
    })

    // ─── Log API (SUPER_ADMIN only) ────────────────────
    .get('/api/admin/logs/app', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const url = new URL(request.url)
      const level = url.searchParams.get('level') as any
      const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
      const afterId = parseInt(url.searchParams.get('afterId') ?? '0', 10)
      return { logs: await getAppLogs({ level: level || undefined, limit, afterId: afterId || undefined }) }
    })

    .get('/api/admin/logs/audit', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || !isSystemAdmin(session.user.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const url = new URL(request.url)
      const userId = url.searchParams.get('userId')
      const action = url.searchParams.get('action')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)

      const where: Record<string, any> = {}
      if (userId) where.userId = userId
      if (action) where.action = action

      const logs = await prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true, image: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return { logs }
    })

    .delete('/api/admin/logs/app', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      await clearAppLogs()
      appLog('info', 'App logs cleared manually')
      return { ok: true }
    })

    .delete('/api/admin/logs/audit', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { id: true, role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const { count } = await prisma.auditLog.deleteMany()
      appLog('info', `Audit logs cleared manually (${count} entries)`)
      return { ok: true, deleted: count }
    })

    // ─── Schema API (SUPER_ADMIN only) ──────────────────
    .get('/api/admin/schema', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const fs = await import('node:fs')
      const schemaPath = `${process.cwd()}/prisma/schema.prisma`
      if (!fs.existsSync(schemaPath)) {
        set.status = 404
        return { error: 'Schema not found' }
      }
      const raw = fs.readFileSync(schemaPath, 'utf-8')
      return { schema: parseSchema(raw) }
    })

    // ─── Routes Metadata API (SUPER_ADMIN only) ─────────
    .get('/api/admin/routes', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const routes = ROUTES_METADATA

      const byMethod: Record<string, number> = {}
      const byAuth: Record<string, number> = {}
      const byCategory: Record<string, number> = {}
      for (const r of routes) {
        byMethod[r.method] = (byMethod[r.method] || 0) + 1
        byAuth[r.auth] = (byAuth[r.auth] || 0) + 1
        byCategory[r.category] = (byCategory[r.category] || 0) + 1
      }

      return {
        routes,
        summary: { total: routes.length, byMethod, byAuth, byCategory },
      }
    })

    // ─── Project Structure API (SUPER_ADMIN only) ──────
    .get('/api/admin/project-structure', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const fs = await import('node:fs')
      const path = await import('node:path')
      const root = process.cwd()
      const scanDirs = ['src', 'prisma', 'tests']
      const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git', '.next'])
      const exts = new Set(['.ts', '.tsx'])

      interface FileInfo {
        path: string
        category: string
        lines: number
        exports: string[]
        imports: { from: string; names: string[] }[]
      }

      interface DirInfo {
        path: string
        category: string
        fileCount: number
      }

      const files: FileInfo[] = []
      const dirs: DirInfo[] = []

      function categorize(filePath: string): string {
        if (filePath.startsWith('src/frontend/routes/')) return 'route'
        if (filePath.startsWith('src/frontend/hooks/')) return 'hook'
        if (filePath.startsWith('src/frontend/components/')) return 'component'
        if (filePath.startsWith('src/frontend')) return 'frontend'
        if (filePath.startsWith('src/lib/')) return 'lib'
        if (filePath.startsWith('prisma/')) return 'prisma'
        if (filePath.startsWith('tests/unit/')) return 'test-unit'
        if (filePath.startsWith('tests/integration/')) return 'test-integration'
        if (filePath.startsWith('tests/')) return 'test'
        if (filePath.startsWith('src/')) return 'backend'
        return 'config'
      }

      function parseFile(filePath: string, content: string): FileInfo {
        const lines = content.split('\n').length
        const exports: string[] = []
        const imports: { from: string; names: string[] }[] = []

        for (const m of content.matchAll(
          /export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g,
        )) {
          exports.push(m[1])
        }
        if (
          /export\s+default\s+/.test(content) &&
          !exports.some(
            (e) => content.includes(`export default function ${e}`) || content.includes(`export default class ${e}`),
          )
        ) {
          exports.push('default')
        }

        for (const m of content.matchAll(
          /import\s+(?:\{([^}]+)\}|(\w+))(?:\s*,\s*\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/g,
        )) {
          const names: string[] = []
          if (m[1])
            names.push(
              ...m[1]
                .split(',')
                .map((s) => s.trim().split(' as ')[0].trim())
                .filter(Boolean),
            )
          if (m[2]) names.push(m[2])
          if (m[3])
            names.push(
              ...m[3]
                .split(',')
                .map((s) => s.trim().split(' as ')[0].trim())
                .filter(Boolean),
            )
          let from = m[4]
          if (from.startsWith('.')) {
            const dir = path.dirname(filePath)
            from = path.normalize(path.join(dir, from)).replace(/\\/g, '/')
            for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
              if (fs.existsSync(path.join(root, from + ext))) {
                from = from + ext
                break
              }
              if (fs.existsSync(path.join(root, from))) break
            }
          }
          imports.push({ from, names })
        }

        return { path: filePath, category: categorize(filePath), lines, exports, imports }
      }

      function scan(dir: string) {
        const absDir = path.join(root, dir)
        if (!fs.existsSync(absDir)) return
        const entries = fs.readdirSync(absDir, { withFileTypes: true })
        let fileCount = 0

        for (const entry of entries) {
          if (skipDirs.has(entry.name)) continue
          const rel = path.join(dir, entry.name).replace(/\\/g, '/')
          if (entry.isDirectory()) {
            scan(rel)
          } else if (exts.has(path.extname(entry.name))) {
            const content = fs.readFileSync(path.join(root, rel), 'utf-8')
            files.push(parseFile(rel, content))
            fileCount++
          }
        }

        dirs.push({ path: dir, category: categorize(`${dir}/`), fileCount })
      }

      for (const d of scanDirs) scan(d)

      files.sort((a, b) => a.path.localeCompare(b.path))
      dirs.sort((a, b) => a.path.localeCompare(b.path))

      const totalLines = files.reduce((s, f) => s + f.lines, 0)
      const totalExports = files.reduce((s, f) => s + f.exports.length, 0)
      const totalImports = files.reduce((s, f) => s + f.imports.length, 0)
      const byCategory: Record<string, number> = {}
      for (const f of files) {
        byCategory[f.category] = (byCategory[f.category] || 0) + 1
      }

      return {
        files,
        directories: dirs,
        summary: { totalFiles: files.length, totalLines, totalExports, totalImports, byCategory },
      }
    })

    // ─── Environment Map API (SUPER_ADMIN only) ─────────
    .get('/api/admin/env-map', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const fs = await import('node:fs')
      const path = await import('node:path')
      const root = process.cwd()

      const envDefs: {
        name: string
        envKey: string
        required: boolean
        default: string | null
        category: string
        description: string
      }[] = [
        { name: 'DATABASE_URL', envKey: 'DATABASE_URL', required: true, default: null, category: 'database', description: 'PostgreSQL connection string' },
        { name: 'REDIS_URL', envKey: 'REDIS_URL', required: true, default: null, category: 'cache', description: 'Redis connection string' },
        { name: 'GOOGLE_CLIENT_ID', envKey: 'GOOGLE_CLIENT_ID', required: true, default: null, category: 'auth', description: 'Google OAuth client ID' },
        { name: 'GOOGLE_CLIENT_SECRET', envKey: 'GOOGLE_CLIENT_SECRET', required: true, default: null, category: 'auth', description: 'Google OAuth client secret' },
        { name: 'SUPER_ADMIN_EMAIL', envKey: 'SUPER_ADMIN_EMAIL', required: false, default: '(empty)', category: 'auth', description: 'Comma-separated emails to auto-promote to SUPER_ADMIN' },
        { name: 'PORT', envKey: 'PORT', required: false, default: '3000', category: 'app', description: 'Server port' },
        { name: 'NODE_ENV', envKey: 'NODE_ENV', required: false, default: 'development', category: 'app', description: 'Environment mode' },
        { name: 'REACT_EDITOR', envKey: 'REACT_EDITOR', required: false, default: 'code', category: 'app', description: 'Editor for click-to-source' },
        { name: 'AUDIT_LOG_RETENTION_DAYS', envKey: 'AUDIT_LOG_RETENTION_DAYS', required: false, default: '90', category: 'app', description: 'Days to keep audit logs' },
        { name: 'WEBHOOK_LOG_RETENTION_DAYS', envKey: 'WEBHOOK_LOG_RETENTION_DAYS', required: false, default: '7', category: 'app', description: 'Days to keep /webhooks/aw request logs' },
        { name: 'MCP_SECRET', envKey: 'MCP_SECRET', required: false, default: '(empty)', category: 'mcp', description: 'Shared secret for MCP (local + /mcp HTTP). Scope gated by NODE_ENV: production=readonly, else=admin.' },
        { name: 'PMW_WEBHOOK_TOKEN', envKey: 'PMW_WEBHOOK_TOKEN', required: false, default: '(empty)', category: 'webhooks', description: 'Fallback bearer token for /webhooks/aw when no DB tokens are active' },
        { name: 'PMW_EVENT_BATCH_MAX', envKey: 'PMW_EVENT_BATCH_MAX', required: false, default: '500', category: 'webhooks', description: 'Max events per /webhooks/aw request (413 on overflow)' },
        { name: 'GITHUB_WEBHOOK_SECRET', envKey: 'GITHUB_WEBHOOK_SECRET', required: false, default: '(empty)', category: 'webhooks', description: 'HMAC SHA-256 secret for /webhooks/github signature verification' },
        { name: 'UPLOADS_DIR', envKey: 'UPLOADS_DIR', required: false, default: './uploads', category: 'app', description: 'Local directory for task evidence uploads' },
        { name: 'UPLOAD_MAX_BYTES', envKey: 'UPLOAD_MAX_BYTES', required: false, default: '10485760', category: 'app', description: 'Max evidence upload size in bytes (default 10 MiB)' },
        { name: 'DIRECT_URL', envKey: 'DIRECT_URL', required: false, default: '(same as DATABASE_URL)', category: 'database', description: 'Prisma direct URL (bypasses connection pool for migrations)' },
      ]

      const srcFiles = [
        'src/lib/env.ts',
        'src/lib/db.ts',
        'src/lib/redis.ts',
        'src/lib/applog.ts',
        'src/app.ts',
        'src/index.tsx',
        'src/vite.ts',
      ]
      const fileContents: Record<string, string> = {}
      for (const f of srcFiles) {
        const absPath = path.join(root, f)
        if (fs.existsSync(absPath)) fileContents[f] = fs.readFileSync(absPath, 'utf-8')
      }

      const variables = envDefs.map((def) => {
        const usedBy: string[] = []
        for (const [file, content] of Object.entries(fileContents)) {
          if (content.includes(def.envKey) || content.includes(`env.${def.name}`)) {
            usedBy.push(file)
          }
        }
        return {
          name: def.name,
          required: def.required,
          isSet: !!process.env[def.envKey],
          default: def.default,
          category: def.category,
          description: def.description,
          usedBy,
        }
      })

      const byCategory: Record<string, number> = {}
      let setCount = 0
      let requiredCount = 0
      for (const v of variables) {
        byCategory[v.category] = (byCategory[v.category] || 0) + 1
        if (v.isSet) setCount++
        if (v.required) requiredCount++
      }

      return {
        variables,
        summary: {
          total: variables.length,
          set: setCount,
          unset: variables.length - setCount,
          required: requiredCount,
          byCategory,
        },
      }
    })

    // ─── Test Coverage Map API (SUPER_ADMIN only) ──────
    .get('/api/admin/test-coverage', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const fs = await import('node:fs')
      const pathMod = await import('node:path')
      const root = process.cwd()
      const exts = new Set(['.ts', '.tsx'])
      const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git'])

      interface SrcFile {
        path: string
        lines: number
        exports: string[]
        testedBy: string[]
        coverage: string
      }
      interface TestFile {
        path: string
        lines: number
        type: string
        targets: string[]
      }

      function scanDir(dir: string, collect: string[]) {
        const abs = pathMod.join(root, dir)
        if (!fs.existsSync(abs)) return
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
          if (skipDirs.has(entry.name)) continue
          const rel = pathMod.join(dir, entry.name).replace(/\\/g, '/')
          if (entry.isDirectory()) scanDir(rel, collect)
          else if (exts.has(pathMod.extname(entry.name))) collect.push(rel)
        }
      }

      const srcPaths: string[] = []
      scanDir('src', srcPaths)
      const srcFiltered = srcPaths.filter((f) => !f.includes('routeTree.gen'))

      const testPaths: string[] = []
      scanDir('tests', testPaths)
      const testFiltered = testPaths.filter((f) => f.includes('.test.'))

      const testFiles: TestFile[] = testFiltered.map((tp) => {
        const content = fs.readFileSync(pathMod.join(root, tp), 'utf-8')
        const lines = content.split('\n').length
        const type = tp.includes('/unit/') ? 'unit' : tp.includes('/integration/') ? 'integration' : 'other'
        const targets: string[] = []
        for (const m of content.matchAll(/from\s+['"]([^'"]*(?:src|lib)[^'"]*)['"]/g)) {
          let resolved = m[1].replace(/^.*?src\//, 'src/')
          if (resolved.startsWith('.')) {
            resolved = pathMod.normalize(pathMod.join(pathMod.dirname(tp), resolved)).replace(/\\/g, '/')
          }
          for (const ext of ['', '.ts', '.tsx']) {
            const full = resolved + ext
            if (srcFiltered.includes(full)) {
              targets.push(full)
              break
            }
          }
        }
        if (/fetch\(['"`]\/api\//.test(content) || /createApp|createTestApp/.test(content)) {
          if (!targets.includes('src/app.ts')) targets.push('src/app.ts')
        }
        return { path: tp, lines, type, targets: [...new Set(targets)] }
      })

      const testedByMap: Record<string, string[]> = {}
      for (const t of testFiles) {
        for (const target of t.targets) {
          if (!testedByMap[target]) testedByMap[target] = []
          testedByMap[target].push(t.path)
        }
      }

      const sourceFiles: SrcFile[] = srcFiltered.map((sp) => {
        const content = fs.readFileSync(pathMod.join(root, sp), 'utf-8')
        const lines = content.split('\n').length
        const exports: string[] = []
        for (const m of content.matchAll(
          /export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g,
        )) {
          exports.push(m[1])
        }
        const tb = testedByMap[sp] || []
        const coverage = tb.length === 0 ? 'uncovered' : tb.some((t) => t.includes('/unit/')) ? 'covered' : 'partial'
        return { path: sp, lines, exports, testedBy: tb, coverage }
      })

      const covered = sourceFiles.filter((f) => f.coverage === 'covered').length
      const partial = sourceFiles.filter((f) => f.coverage === 'partial').length
      const uncovered = sourceFiles.filter((f) => f.coverage === 'uncovered').length

      return {
        sourceFiles,
        testFiles,
        summary: {
          totalSource: sourceFiles.length,
          totalTests: testFiles.length,
          covered,
          partial,
          uncovered,
          coveragePercent: Math.round(((covered + partial * 0.5) / sourceFiles.length) * 100),
        },
      }
    })

    // ─── Dependencies Graph API (SUPER_ADMIN only) ─────
    .get('/api/admin/dependencies', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const fs = await import('node:fs')
      const pathMod = await import('node:path')
      const root = process.cwd()
      const pkgPath = pathMod.join(root, 'package.json')
      if (!fs.existsSync(pkgPath)) {
        set.status = 404
        return { error: 'package.json not found' }
      }

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const deps: Record<string, string> = pkg.dependencies || {}
      const devDeps: Record<string, string> = pkg.devDependencies || {}

      const catMap: Record<string, string> = {
        elysia: 'server',
        '@elysiajs/cors': 'server',
        '@elysiajs/html': 'server',
        react: 'ui',
        'react-dom': 'ui',
        '@mantine/core': 'ui',
        '@mantine/hooks': 'ui',
        '@tanstack/react-router': 'ui',
        '@tanstack/react-query': 'ui',
        '@xyflow/react': 'ui',
        'react-icons': 'ui',
        '@prisma/client': 'database',
        prisma: 'database',
        vite: 'build',
        typescript: 'build',
        '@biomejs/biome': 'build',
        '@vitejs/plugin-react': 'build',
        '@tanstack/router-plugin': 'build',
      }

      const srcFiles: string[] = []
      function scanSrc(dir: string) {
        const abs = pathMod.join(root, dir)
        if (!fs.existsSync(abs)) return
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
          if (['node_modules', 'dist', 'generated', '.git'].includes(e.name)) continue
          const rel = pathMod.join(dir, e.name).replace(/\\/g, '/')
          if (e.isDirectory()) scanSrc(rel)
          else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(rel)
        }
      }
      scanSrc('src')

      const fileContents: Record<string, string> = {}
      for (const f of srcFiles) {
        fileContents[f] = fs.readFileSync(pathMod.join(root, f), 'utf-8')
      }

      const allPkgs: { name: string; version: string; type: string; category: string; usedBy: string[] }[] = []

      for (const [name, version] of Object.entries(deps)) {
        const usedBy: string[] = []
        const importPattern = new RegExp(`from\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
        for (const [file, content] of Object.entries(fileContents)) {
          if (importPattern.test(content)) usedBy.push(file)
        }
        allPkgs.push({ name, version, type: 'runtime', category: catMap[name] || 'other', usedBy })
      }

      for (const [name, version] of Object.entries(devDeps)) {
        allPkgs.push({ name, version, type: 'dev', category: catMap[name] || 'build', usedBy: [] })
      }

      const byCategory: Record<string, number> = {}
      let runtime = 0,
        dev = 0
      for (const p of allPkgs) {
        byCategory[p.category] = (byCategory[p.category] || 0) + 1
        if (p.type === 'runtime') runtime++
        else dev++
      }

      return {
        packages: allPkgs,
        summary: { total: allPkgs.length, runtime, dev, byCategory },
      }
    })

    // ─── Migrations Timeline API (SUPER_ADMIN only) ────
    .get('/api/admin/migrations', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const fs = await import('node:fs')
      const pathMod = await import('node:path')
      const root = process.cwd()
      const migrationsDir = pathMod.join(root, 'prisma/migrations')

      if (!fs.existsSync(migrationsDir)) {
        return {
          migrations: [],
          summary: { totalMigrations: 0, firstMigration: null, lastMigration: null, totalChanges: 0 },
        }
      }

      const entries = fs
        .readdirSync(migrationsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name))

      const migrations = entries.map((entry) => {
        const sqlPath = pathMod.join(migrationsDir, entry.name, 'migration.sql')
        let sql = ''
        const changes: string[] = []

        if (fs.existsSync(sqlPath)) {
          sql = fs.readFileSync(sqlPath, 'utf-8')
          for (const m of sql.matchAll(
            /^(CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX|DROP TABLE|DROP INDEX|CREATE TYPE|ALTER TYPE)\s+["']?(\w+)["']?/gim,
          )) {
            changes.push(`${m[1]} ${m[2]}`)
          }
          for (const m of sql.matchAll(/CREATE TYPE\s+"(\w+)"/g)) {
            if (!changes.some((c) => c.includes(m[1]))) changes.push(`CREATE TYPE ${m[1]}`)
          }
        }

        const dateStr = entry.name.substring(0, 14)
        const createdAt = new Date(
          `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(8, 10)}:${dateStr.slice(10, 12)}:${dateStr.slice(12, 14)}.000Z`,
        ).toISOString()

        const name = entry.name.substring(15)

        return { name, folder: entry.name, createdAt, changes, sql: sql.substring(0, 800) }
      })

      const totalChanges = migrations.reduce((s, m) => s + m.changes.length, 0)

      return {
        migrations,
        summary: {
          totalMigrations: migrations.length,
          firstMigration: migrations[0]?.createdAt || null,
          lastMigration: migrations[migrations.length - 1]?.createdAt || null,
          totalChanges,
        },
      }
    })

    // ─── Sessions Live API (SUPER_ADMIN only) ──────────
    .get('/api/admin/sessions', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || !isSystemAdmin(session.user.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const onlineIds = new Set(getOnlineUserIds())
      const sessions = await prisma.session.findMany({
        include: { user: { select: { id: true, name: true, email: true, role: true, blocked: true, image: true } } },
        orderBy: { createdAt: 'desc' },
      })

      const now = new Date()
      const result = sessions.map((s) => ({
        id: s.id,
        userId: s.user.id,
        userName: s.user.name,
        userEmail: s.user.email,
        userRole: s.user.role,
        userBlocked: s.user.blocked,
        userImage: s.user.image ?? null,
        isOnline: onlineIds.has(s.user.id),
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        isExpired: s.expiresAt < now,
      }))

      const byRole: Record<string, number> = {}
      const uniqueUsers = new Set<string>()
      let active = 0,
        expired = 0
      for (const s of result) {
        uniqueUsers.add(s.userId)
        byRole[s.userRole] = (byRole[s.userRole] || 0) + 1
        if (s.isExpired) expired++
        else active++
      }

      return {
        sessions: result,
        summary: {
          totalSessions: result.length,
          activeSessions: active,
          expiredSessions: expired,
          onlineUsers: onlineIds.size,
          byRole,
        },
      }
    })

    // ─── System Health ────────────────────────────────
    .get('/api/admin/health', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const now = Date.now()
      const since24h = new Date(now - 24 * 60 * 60 * 1000)
      const LIVE_MS = 5 * 60 * 1000

      const dbStart = Date.now()
      let dbOk = false
      let dbLatencyMs: number | null = null
      let dbError: string | null = null
      try {
        await prisma.$queryRawUnsafe('SELECT 1')
        dbOk = true
        dbLatencyMs = Date.now() - dbStart
      } catch (e) {
        dbError = e instanceof Error ? e.message : 'unknown'
      }

      const redisStart = Date.now()
      let redisOk = false
      let redisLatencyMs: number | null = null
      let redisError: string | null = null
      try {
        await redis.send('PING', [])
        redisOk = true
        redisLatencyMs = Date.now() - redisStart
      } catch (e) {
        redisError = e instanceof Error ? e.message : 'unknown'
      }

      const [
        agents,
        sessionsTotal,
        sessionsActive,
        webhookTotal,
        webhookOk,
        webhookFail,
        webhookAuthFail,
        webhookEvents,
        auditLogCount,
        webhookLogCount,
        agentsCount,
        tokensActive,
      ] = await Promise.all([
        prisma.agent.findMany({ select: { status: true, lastSeenAt: true } }),
        prisma.session.count(),
        prisma.session.count({ where: { expiresAt: { gt: new Date(now) } } }),
        prisma.webhookRequestLog.count({ where: { createdAt: { gte: since24h } } }),
        prisma.webhookRequestLog.count({ where: { createdAt: { gte: since24h }, statusCode: { lt: 400 } } }),
        prisma.webhookRequestLog.count({
          where: { createdAt: { gte: since24h }, statusCode: { gte: 400 }, reason: { not: 'unauthorized' } },
        }),
        prisma.webhookRequestLog.count({ where: { createdAt: { gte: since24h }, reason: 'unauthorized' } }),
        prisma.webhookRequestLog.aggregate({
          _sum: { eventsIn: true },
          where: { createdAt: { gte: since24h } },
        }),
        prisma.auditLog.count(),
        prisma.webhookRequestLog.count(),
        prisma.agent.count(),
        prisma.webhookToken.count({ where: { status: 'ACTIVE' } }),
      ])

      const agentSummary = {
        total: agentsCount,
        pending: agents.filter((a) => a.status === 'PENDING').length,
        approved: agents.filter((a) => a.status === 'APPROVED').length,
        revoked: agents.filter((a) => a.status === 'REVOKED').length,
        live: agents.filter((a) => a.status === 'APPROVED' && a.lastSeenAt && now - a.lastSeenAt.getTime() < LIVE_MS)
          .length,
      }

      const webhooks = {
        total24h: webhookTotal,
        success24h: webhookOk,
        fail24h: webhookFail,
        authFail24h: webhookAuthFail,
        eventsIn24h: webhookEvents._sum.eventsIn ?? 0,
        successRate: webhookTotal > 0 ? Math.round((webhookOk / webhookTotal) * 1000) / 10 : null,
        activeTokens: tokensActive,
      }

      const retention = {
        auditLogDays: env.AUDIT_LOG_RETENTION_DAYS,
        auditLogCount,
        webhookLogDays: env.WEBHOOK_LOG_RETENTION_DAYS,
        webhookLogCount,
      }

      const envChecks: { key: string; set: boolean; required: boolean; note?: string }[] = [
        { key: 'DATABASE_URL', set: !!Bun.env.DATABASE_URL, required: true },
        { key: 'REDIS_URL', set: !!Bun.env.REDIS_URL, required: true },
        { key: 'GOOGLE_CLIENT_ID', set: !!Bun.env.GOOGLE_CLIENT_ID, required: true },
        { key: 'GOOGLE_CLIENT_SECRET', set: !!Bun.env.GOOGLE_CLIENT_SECRET, required: true },
        {
          key: 'PMW_WEBHOOK_TOKEN',
          set: !!Bun.env.PMW_WEBHOOK_TOKEN,
          required: false,
          note: tokensActive > 0 ? 'DB tokens active, env fallback unused' : 'env fallback in use',
        },
        { key: 'GITHUB_WEBHOOK_SECRET', set: !!Bun.env.GITHUB_WEBHOOK_SECRET, required: false },
        { key: 'MCP_SECRET', set: !!Bun.env.MCP_SECRET, required: false },
        { key: 'SUPER_ADMIN_EMAIL', set: !!Bun.env.SUPER_ADMIN_EMAIL, required: false },
      ]

      return {
        timestamp: new Date(now).toISOString(),
        services: {
          db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
          redis: { ok: redisOk, latencyMs: redisLatencyMs, error: redisError },
        },
        sessions: {
          total: sessionsTotal,
          active: sessionsActive,
          online: getOnlineUserIds().length,
        },
        agents: agentSummary,
        webhooks,
        retention,
        env: envChecks,
      }
    })

    // ─── Effort tracking (pm-watch × tasks) ──────────
    .get('/api/admin/effort', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const projectId = typeof query.projectId === 'string' ? query.projectId : undefined
      const onlyClosed = query.onlyClosed === 'true'
      const limit = Math.min(500, Math.max(1, Number(query.limit) || 100))
      const rows = await effortReport({ projectId, onlyClosed, limit })
      return { count: rows.length, rows }
    })

    .get('/api/admin/effort/task/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const effort = await computeTaskEffort(params.id)
      if (!effort) {
        set.status = 404
        return { error: 'Task not found' }
      }
      return effort
    })

    .get('/api/admin/effort/ghost', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const staleDays = Math.min(30, Math.max(1, Number(query.staleDays) || 3))
      const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
      const rows = await detectGhostTasks({ staleDays, limit })
      return { count: rows.length, staleDays, rows }
    })

    .get('/api/admin/effort/phantom', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const days = Math.min(90, Math.max(1, Number(query.days) || 7))
      const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
      const rows = await computePhantomWork({ days, limit })
      return { count: rows.length, days, rows }
    })

    // ─── Admin Overview Cockpit ───────────────────────
    .get('/api/admin/overview/risks', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const staleDays = Math.min(30, Math.max(1, Number(query.staleDays) || 3))
      const offlineHours = Math.min(720, Math.max(1, Number(query.offlineHours) || 1))
      return computeRiskReport({ staleDays, offlineHours })
    })

    .get('/api/admin/overview/health', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const projectId = typeof query.projectId === 'string' ? query.projectId : undefined
      const includeArchived = query.includeArchived === 'true'
      const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
      return computeProjectHealth({ projectId, includeArchived, limit })
    })

    .get('/api/admin/overview/load', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const projectId = typeof query.projectId === 'string' ? query.projectId : undefined
      const includeUnassigned = query.includeUnassigned !== 'false'
      const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
      return computeTeamLoad({ projectId, includeUnassigned, limit })
    })

    .get('/api/admin/overview/kpis', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const recentAuditLimit = Math.min(50, Math.max(0, Number(query.recentAuditLimit) || 8))
      return computeAdminOverview({ recentAuditLimit })
    })

    .get('/api/admin/overview/analytics', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const timelineLimit = Math.min(50, Math.max(1, Number(query.timelineLimit) || 12))
      const trendDays = Math.min(60, Math.max(1, Number(query.trendDays) || 14))
      return computeAnalytics({ timelineLimit, trendDays })
    })

    // ─── Self-project config (SUPER_ADMIN only) ────────
    .get('/api/admin/self-project', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const selfProject = await getSelfProject()
      return { selfProject }
    })

    .put('/api/admin/self-project', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const body = (await request.json()) as { projectId?: string }
      if (!body.projectId) {
        set.status = 400
        return { error: 'projectId wajib diisi' }
      }
      const exists = await prisma.project.findUnique({
        where: { id: body.projectId },
        select: { id: true, name: true },
      })
      if (!exists) {
        set.status = 404
        return { error: 'Project not found' }
      }
      const selfProject = await setSelfProject(body.projectId)
      audit(auth.userId, 'SELF_PROJECT_SET', `${selfProject.name} (${selfProject.id})`, getIp(request))
      appLog('info', `Self-project set: ${selfProject.name} by ${auth.email}`)
      return { selfProject }
    })

    .delete('/api/admin/self-project', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      await clearSelfProject()
      audit(auth.userId, 'SELF_PROJECT_CLEARED', 'none', getIp(request))
      appLog('info', `Self-project cleared by ${auth.email}`)
      return { ok: true }
    })

    // ─── Portfolio Report ─────────────────────────────
    .get('/api/admin/report', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const now = new Date()
      const defaultSince = new Date(now.getFullYear(), now.getMonth(), 1)
      const since = typeof query.since === 'string' ? new Date(query.since) : defaultSince
      const until = typeof query.until === 'string' ? new Date(query.until) : now
      if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || until <= since) {
        set.status = 400
        return { error: 'Invalid since/until' }
      }
      const days = Math.max(1, Math.ceil((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)))
      const trendDays = Math.min(60, Math.max(7, days))

      const [
        kpis,
        health,
        risks,
        load,
        analytics,
        effort,
        priorityGroups,
        commitsInPeriod,
        prsOpenedInPeriod,
        prsMergedInPeriod,
        reviewsInPeriod,
        perProjectGithub,
        closedInPeriod,
        createdInPeriod,
        auditHighlights,
      ] = await Promise.all([
        computeAdminOverview({ recentAuditLimit: 0 }),
        computeProjectHealth({ limit: 200 }),
        computeRiskReport({}),
        computeTeamLoad({ limit: 200 }),
        computeAnalytics({ trendDays, timelineLimit: 50 }),
        effortReport({ limit: 100 }),
        prisma.task.groupBy({ by: ['priority'], _count: true }),
        prisma.projectGithubEvent.count({
          where: { kind: 'PUSH_COMMIT', createdAt: { gte: since, lte: until } },
        }),
        prisma.projectGithubEvent.count({
          where: { kind: 'PR_OPENED', createdAt: { gte: since, lte: until } },
        }),
        prisma.projectGithubEvent.count({
          where: { kind: 'PR_MERGED', createdAt: { gte: since, lte: until } },
        }),
        prisma.projectGithubEvent.count({
          where: { kind: 'PR_REVIEWED', createdAt: { gte: since, lte: until } },
        }),
        prisma.projectGithubEvent.groupBy({
          by: ['projectId', 'kind'],
          where: { createdAt: { gte: since, lte: until } },
          _count: true,
        }),
        prisma.task.count({ where: { status: 'CLOSED', closedAt: { gte: since, lte: until } } }),
        prisma.task.count({ where: { createdAt: { gte: since, lte: until } } }),
        prisma.auditLog.findMany({
          where: {
            action: { notIn: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED'] },
            createdAt: { gte: since, lte: until },
          },
          include: { user: { select: { email: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ])

      const overEstimate = effort
        .filter((e) => e.verdict === 'over' && e.variancePercent !== null)
        .sort((a, b) => (b.variancePercent ?? 0) - (a.variancePercent ?? 0))
        .slice(0, 5)
      const underEstimate = effort
        .filter((e) => e.verdict === 'under' && e.variancePercent !== null)
        .sort((a, b) => (a.variancePercent ?? 0) - (b.variancePercent ?? 0))
        .slice(0, 5)

      const projectIds = Array.from(new Set(perProjectGithub.map((g) => g.projectId)))
      const githubProjects =
        projectIds.length > 0
          ? await prisma.project.findMany({
              where: { id: { in: projectIds } },
              select: { id: true, name: true, githubRepo: true },
            })
          : []
      const projectMap = new Map(githubProjects.map((p) => [p.id, p]))
      const githubByProject = projectIds
        .map((id) => {
          const p = projectMap.get(id)
          const entries = perProjectGithub.filter((g) => g.projectId === id)
          const counts: Record<string, number> = {}
          for (const e of entries) counts[e.kind] = e._count
          return {
            projectId: id,
            projectName: p?.name ?? 'Unknown',
            repo: p?.githubRepo ?? null,
            commits: counts.PUSH_COMMIT ?? 0,
            prsOpened: counts.PR_OPENED ?? 0,
            prsMerged: counts.PR_MERGED ?? 0,
            prsClosed: counts.PR_CLOSED ?? 0,
            reviews: counts.PR_REVIEWED ?? 0,
          }
        })
        .sort((a, b) => b.commits + b.prsMerged - (a.commits + a.prsMerged))

      const avgHealthScore =
        health.projects.length > 0
          ? Math.round(health.projects.reduce((s, p) => s + p.score, 0) / health.projects.length)
          : null

      return {
        window: { since, until, days },
        generatedAt: now,
        generatedBy: { email: auth.email },
        kpis,
        health,
        risks,
        load,
        analytics,
        priorityGroups: priorityGroups.map((g) => ({ priority: g.priority, count: g._count })),
        taskSnapshot: { closedInPeriod, createdInPeriod, avgHealthScore },
        github: {
          commits: commitsInPeriod,
          prsOpened: prsOpenedInPeriod,
          prsMerged: prsMergedInPeriod,
          reviews: reviewsInPeriod,
          byProject: githubByProject,
        },
        effort: {
          overEstimate,
          underEstimate,
          totalAnalyzed: effort.length,
        },
        audit: auditHighlights.map((a) => ({
          id: a.id,
          action: a.action,
          detail: a.detail,
          ip: a.ip,
          createdAt: a.createdAt,
          userEmail: a.user?.email ?? null,
          userName: a.user?.name ?? null,
        })),
      }
    })

    // ─── Admin Agents API (SUPER_ADMIN only) ───────────
    .get('/api/admin/agents', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const agents = await prisma.agent.findMany({
        include: {
          claimedBy: { select: { id: true, name: true, email: true, role: true, image: true } },
          _count: { select: { events: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return { agents }
    })

    .post('/api/admin/agents/:id/approve', async ({ request, params, set }) => {
      const ip = getIp(request)
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const { userId } = (await request.json()) as { userId?: string }
      if (!userId) {
        set.status = 400
        return { error: 'userId wajib diisi' }
      }
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
      if (!user) {
        set.status = 404
        return { error: 'User tidak ditemukan' }
      }
      const existing = await prisma.agent.findUnique({ where: { id: params.id }, select: { id: true } })
      if (!existing) {
        set.status = 404
        return { error: 'Agent tidak ditemukan' }
      }
      const agent = await prisma.agent.update({
        where: { id: params.id },
        data: { status: 'APPROVED', claimedById: user.id },
        include: {
          claimedBy: { select: { id: true, name: true, email: true, role: true, image: true } },
          _count: { select: { events: true } },
        },
      })
      audit(auth.userId, 'AGENT_APPROVED', `agent=${agent.agentId} → ${user.email}`, ip)
      appLog('info', `Agent approved: ${agent.agentId} → ${user.email}`)
      return { agent }
    })

    .post('/api/admin/agents/:id/revoke', async ({ request, params, set }) => {
      const ip = getIp(request)
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const existing = await prisma.agent.findUnique({ where: { id: params.id }, select: { id: true } })
      if (!existing) {
        set.status = 404
        return { error: 'Agent tidak ditemukan' }
      }
      const agent = await prisma.agent.update({
        where: { id: params.id },
        data: { status: 'REVOKED', claimedById: null },
        include: {
          claimedBy: { select: { id: true, name: true, email: true, role: true, image: true } },
          _count: { select: { events: true } },
        },
      })
      audit(auth.userId, 'AGENT_REVOKED', `agent=${agent.agentId}`, ip)
      appLog('info', `Agent revoked: ${agent.agentId}`)
      return { agent }
    })

    // ─── Admin Webhook Tokens API (SUPER_ADMIN only) ──
    .get('/api/admin/webhook-tokens', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const tokens = await prisma.webhookToken.findMany({
        include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return {
        tokens: tokens.map((t) => ({
          id: t.id,
          name: t.name,
          tokenPrefix: t.tokenPrefix,
          status: t.status,
          expiresAt: t.expiresAt,
          lastUsedAt: t.lastUsedAt,
          createdBy: t.createdBy,
          createdAt: t.createdAt,
        })),
        envFallback: !!env.PMW_WEBHOOK_TOKEN,
      }
    })

    .post('/api/admin/webhook-tokens', async ({ request, set }) => {
      const ip = getIp(request)
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      let body: { name?: string; expiresAt?: string | null }
      try {
        body = (await request.json()) as typeof body
      } catch {
        set.status = 400
        return { error: 'Invalid JSON' }
      }
      const name = (body.name ?? '').trim()
      if (!name) {
        set.status = 400
        return { error: 'name wajib diisi' }
      }
      let expiresAt: Date | null = null
      if (body.expiresAt) {
        const d = new Date(body.expiresAt)
        if (Number.isNaN(d.getTime())) {
          set.status = 400
          return { error: 'expiresAt invalid' }
        }
        expiresAt = d
      }
      const { raw, hash, prefix } = generateWebhookToken()
      const token = await prisma.webhookToken.create({
        data: {
          name,
          tokenHash: hash,
          tokenPrefix: prefix,
          expiresAt,
          createdById: auth.userId,
        },
      })
      audit(auth.userId, 'WEBHOOK_TOKEN_CREATED', `token=${name} prefix=${prefix}`, ip)
      appLog('info', `Webhook token created: ${name} (${prefix})`)
      return {
        token: {
          id: token.id,
          name: token.name,
          tokenPrefix: token.tokenPrefix,
          status: token.status,
          expiresAt: token.expiresAt,
          createdAt: token.createdAt,
        },
        raw,
      }
    })

    .patch('/api/admin/webhook-tokens/:id', async ({ request, params, set }) => {
      const ip = getIp(request)
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      let body: { status?: 'ACTIVE' | 'DISABLED' | 'REVOKED'; name?: string }
      try {
        body = (await request.json()) as typeof body
      } catch {
        set.status = 400
        return { error: 'Invalid JSON' }
      }
      const data: { status?: 'ACTIVE' | 'DISABLED' | 'REVOKED'; name?: string } = {}
      if (body.status !== undefined) {
        if (!['ACTIVE', 'DISABLED', 'REVOKED'].includes(body.status)) {
          set.status = 400
          return { error: 'status must be ACTIVE | DISABLED | REVOKED' }
        }
        data.status = body.status
      }
      if (body.name !== undefined) {
        const trimmed = body.name.trim()
        if (!trimmed) {
          set.status = 400
          return { error: 'name tidak boleh kosong' }
        }
        data.name = trimmed
      }
      if (Object.keys(data).length === 0) {
        set.status = 400
        return { error: 'Provide status and/or name' }
      }
      const existing = await prisma.webhookToken.findUnique({ where: { id: params.id } })
      if (!existing) {
        set.status = 404
        return { error: 'Token not found' }
      }
      if (data.status && existing.status === 'REVOKED') {
        set.status = 400
        return { error: 'Revoked tokens cannot be reactivated' }
      }
      const updated = await prisma.webhookToken.update({
        where: { id: params.id },
        data,
        include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
      })
      const auditAction = data.status ? `WEBHOOK_TOKEN_${data.status}` : 'WEBHOOK_TOKEN_RENAMED'
      audit(auth.userId, auditAction, `token=${updated.name} prefix=${updated.tokenPrefix}`, ip)
      appLog('info', `Webhook token ${auditAction}: ${updated.name} (${updated.tokenPrefix})`)
      return {
        token: {
          id: updated.id,
          name: updated.name,
          tokenPrefix: updated.tokenPrefix,
          status: updated.status,
          expiresAt: updated.expiresAt,
          lastUsedAt: updated.lastUsedAt,
          createdBy: updated.createdBy,
          createdAt: updated.createdAt,
        },
      }
    })

    .delete('/api/admin/webhook-tokens/:id', async ({ request, params, set }) => {
      const ip = getIp(request)
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const existing = await prisma.webhookToken.findUnique({ where: { id: params.id } })
      if (!existing) {
        set.status = 404
        return { error: 'Token not found' }
      }
      const token = await prisma.webhookToken.delete({ where: { id: params.id } })
      audit(auth.userId, 'WEBHOOK_TOKEN_DELETED', `token=${token.name} prefix=${token.tokenPrefix}`, ip)
      appLog('info', `Webhook token deleted: ${token.name} (${token.tokenPrefix})`)
      return { ok: true }
    })

    // ─── Webhook Monitor API (SUPER_ADMIN only) ────────
    .get('/api/admin/webhooks/stats', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const now = Date.now()
      const last24h = new Date(now - 24 * 60 * 60 * 1000)
      const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000)

      const [total24h, total7d, okCount24h, failCount24h, authFail24h, rows24h, byToken, byAgent] = await Promise.all([
        prisma.webhookRequestLog.count({ where: { createdAt: { gte: last24h } } }),
        prisma.webhookRequestLog.count({ where: { createdAt: { gte: last7d } } }),
        prisma.webhookRequestLog.count({ where: { createdAt: { gte: last24h }, statusCode: 200 } }),
        prisma.webhookRequestLog.count({ where: { createdAt: { gte: last24h }, statusCode: { gte: 400 } } }),
        prisma.webhookRequestLog.count({
          where: { createdAt: { gte: last24h }, statusCode: { in: [401, 403] } },
        }),
        prisma.webhookRequestLog.aggregate({
          where: { createdAt: { gte: last24h }, statusCode: 200 },
          _sum: { eventsIn: true },
        }),
        prisma.webhookRequestLog.groupBy({
          by: ['tokenId'],
          where: { createdAt: { gte: last7d } },
          _count: { _all: true },
        }),
        prisma.webhookRequestLog.groupBy({
          by: ['agentId'],
          where: { createdAt: { gte: last7d }, agentId: { not: null } },
          _count: { _all: true },
        }),
      ])

      const tokenIds = byToken.map((b) => b.tokenId).filter((x): x is string => !!x)
      const agentIds = byAgent.map((b) => b.agentId).filter((x): x is string => !!x)
      const [tokens, agents, seriesRows] = await Promise.all([
        tokenIds.length
          ? prisma.webhookToken.findMany({
              where: { id: { in: tokenIds } },
              select: { id: true, name: true, tokenPrefix: true, status: true, lastUsedAt: true },
            })
          : [],
        agentIds.length
          ? prisma.agent.findMany({
              where: { id: { in: agentIds } },
              select: { id: true, agentId: true, hostname: true, status: true, lastSeenAt: true },
            })
          : [],
        prisma.webhookRequestLog.findMany({
          where: { createdAt: { gte: last24h } },
          select: { createdAt: true, statusCode: true, eventsIn: true },
          orderBy: { createdAt: 'asc' },
        }),
      ])
      const tokenMap = new Map(tokens.map((t) => [t.id, t]))
      const agentMap = new Map(agents.map((a) => [a.id, a]))

      const buckets: { t: string; total: number; ok: number; fail: number; authFail: number; events: number }[] = []
      const bucketIdx = new Map<number, number>()
      const hourMs = 60 * 60 * 1000
      const firstHour = Math.floor((now - 23 * hourMs) / hourMs) * hourMs
      for (let i = 0; i < 24; i++) {
        const t = firstHour + i * hourMs
        bucketIdx.set(t, buckets.length)
        buckets.push({ t: new Date(t).toISOString(), total: 0, ok: 0, fail: 0, authFail: 0, events: 0 })
      }
      for (const r of seriesRows) {
        const slot = Math.floor(r.createdAt.getTime() / hourMs) * hourMs
        const idx = bucketIdx.get(slot)
        if (idx === undefined) continue
        const b = buckets[idx]
        b.total += 1
        if (r.statusCode === 200) {
          b.ok += 1
          b.events += r.eventsIn
        } else if (r.statusCode === 401 || r.statusCode === 403) {
          b.authFail += 1
          b.fail += 1
        } else if (r.statusCode >= 400) {
          b.fail += 1
        }
      }

      return {
        series: buckets,
        summary: {
          total24h,
          total7d,
          ok24h: okCount24h,
          fail24h: failCount24h,
          authFail24h,
          eventsIn24h: rows24h._sum.eventsIn ?? 0,
          successRate24h: total24h ? okCount24h / total24h : null,
        },
        perToken: byToken
          .map((b) => ({
            tokenId: b.tokenId,
            token: b.tokenId ? (tokenMap.get(b.tokenId) ?? null) : null,
            hits: b._count._all,
          }))
          .sort((a, b) => b.hits - a.hits),
        perAgent: byAgent
          .map((b) => ({
            agentDbId: b.agentId,
            agent: b.agentId ? (agentMap.get(b.agentId) ?? null) : null,
            hits: b._count._all,
          }))
          .sort((a, b) => b.hits - a.hits),
      }
    })

    .get('/api/admin/webhooks/logs', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const status = typeof query.status === 'string' ? query.status : 'all'
      const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 500)
      const where: Record<string, unknown> = {}
      if (status === 'ok') where.statusCode = 200
      else if (status === 'fail') where.statusCode = { gte: 400 }
      else if (status === 'auth') where.statusCode = { in: [401, 403] }
      const logs = await prisma.webhookRequestLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          token: { select: { id: true, name: true, tokenPrefix: true } },
          agent: { select: { id: true, agentId: true, hostname: true } },
        },
      })
      return { logs }
    })

    // ─── Data Sync: Export (Bearer MCP_SECRET) ───────────
    .get('/api/admin/sync/export', async ({ request, set }) => {
      if (!env.MCP_SECRET) {
        set.status = 503
        return { error: 'MCP_SECRET not configured' }
      }
      const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
      if (bearer !== env.MCP_SECRET) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const url = new URL(request.url)
      const requested = new Set(
        (url.searchParams.get('entities') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      )
      const all = requested.size === 0
      const want = (k: string) => all || requested.has(k)

      const result: Record<string, unknown> = {}

      if (want('users')) {
        result.users = await prisma.user.findMany({
          select: {
            id: true, name: true, email: true, role: true, blocked: true,
            preferences: true, emailVerified: true, image: true,
            createdAt: true, updatedAt: true,
          },
        })
      }
      if (want('projects')) {
        result.projects = await prisma.project.findMany({
          include: {
            members: true,
            extensions: true,
          },
        })
      }
      if (want('tasks')) {
        result.tasks = await prisma.task.findMany({
          include: {
            tags: { select: { tagId: true } },
            checklist: true,
            comments: true,
            evidence: true,
            statusChanges: true,
            blockedBy: true,
          },
        })
      }
      if (want('tags')) {
        result.tags = await prisma.tag.findMany()
      }
      if (want('milestones')) {
        result.milestones = await prisma.projectMilestone.findMany()
      }
      if (want('agents')) {
        result.agents = await prisma.agent.findMany()
      }
      if (want('activityEvents')) {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        result.activityEvents = await prisma.activityEvent.findMany({
          where: { createdAt: { gte: since } },
        })
      }
      if (want('webhookTokens')) {
        result.webhookTokens = await prisma.webhookToken.findMany({
          select: {
            id: true, name: true, tokenPrefix: true, status: true,
            expiresAt: true, lastUsedAt: true, createdById: true,
            createdAt: true, updatedAt: true,
          },
        })
      }

      appLog('info', `Sync export requested (entities: ${[...requested].join(',') || 'all'}) from ${getIp(request)}`)
      return { exportedAt: new Date().toISOString(), entities: result }
    })

    // ─── Data Sync: Pull (SUPER_ADMIN session) ────────────
    .post('/api/admin/sync/pull', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (!token) { set.status = 401; return { error: 'Unauthorized' } }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { id: true, role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403; return { error: 'Forbidden' }
      }

      let body: { url?: unknown; token?: unknown; entities?: unknown }
      try { body = (await request.json()) as typeof body } catch { set.status = 400; return { error: 'Invalid JSON' } }

      const remoteUrl = typeof body.url === 'string' ? body.url.replace(/\/+$/, '') : ''
      const remoteToken = typeof body.token === 'string' ? body.token.trim() : ''
      const entities: string[] = Array.isArray(body.entities) ? body.entities.filter((e): e is string => typeof e === 'string') : []

      if (!remoteUrl || !remoteToken) {
        set.status = 400; return { error: 'url dan token wajib diisi' }
      }

      const exportUrl = `${remoteUrl}/api/admin/sync/export?entities=${entities.join(',')}`
      let exportRes: Response
      try {
        exportRes = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${remoteToken}` },
          signal: AbortSignal.timeout(60_000),
        })
      } catch (e) {
        set.status = 502; return { error: `Tidak bisa terhubung ke ${remoteUrl}: ${(e as Error).message}` }
      }
      if (!exportRes.ok) {
        set.status = 502; return { error: `Remote mengembalikan status ${exportRes.status}` }
      }
      const { entities: data } = (await exportRes.json()) as { exportedAt: string; entities: Record<string, unknown[]> }

      const want = (k: string) => entities.length === 0 || entities.includes(k)
      const summary: Record<string, number> = {}

      if (want('tasks') || want('projects')) {
        await prisma.taskStatusChange.deleteMany()
        await prisma.taskComment.deleteMany()
        await prisma.taskEvidence.deleteMany()
        await prisma.taskChecklistItem.deleteMany()
        await prisma.taskDependency.deleteMany()
        await prisma.taskTag.deleteMany()
        await prisma.task.deleteMany()
      }
      if (want('tags') || want('projects')) await prisma.tag.deleteMany()
      if (want('projects')) {
        await prisma.projectExtension.deleteMany()
        await prisma.projectMilestone.deleteMany()
        await prisma.projectMember.deleteMany()
        await prisma.projectGithubEvent.deleteMany()
        await prisma.githubWebhookLog.deleteMany()
        await prisma.project.deleteMany()
      }
      if (want('milestones')) await prisma.projectMilestone.deleteMany()
      if (want('activityEvents')) await prisma.activityEvent.deleteMany()
      if (want('agents')) {
        await prisma.activityEvent.deleteMany()
        await prisma.webhookRequestLog.deleteMany()
        await prisma.agent.deleteMany()
      }
      if (want('webhookTokens')) {
        await prisma.webhookRequestLog.deleteMany()
        await prisma.webhookToken.deleteMany()
      }
      if (want('users')) {
        await prisma.notification.deleteMany()
        await prisma.auditLog.deleteMany()
        await prisma.session.deleteMany()
        await prisma.account.deleteMany()
        await prisma.user.deleteMany()
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ins = (fn: (a: any) => Promise<unknown>, rows: unknown[]) => fn({ data: rows, skipDuplicates: true })

      if (data.users && want('users')) {
        const rows = (data.users as Array<Record<string, unknown>>).map((u) => ({ ...u, password: '' }))
        await ins(prisma.user.createMany.bind(prisma.user), rows)
        summary.users = rows.length
      }
      if (data.projects && want('projects')) {
        type ProjRow = { members?: unknown; extensions?: unknown; [k: string]: unknown }
        const projects = (data.projects as ProjRow[]).map(({ members: _m, extensions: _e, ...p }) => p)
        await ins(prisma.project.createMany.bind(prisma.project), projects)
        summary.projects = projects.length
        const members = (data.projects as ProjRow[]).flatMap((p) => (p.members as unknown[] | undefined) ?? [])
        if (members.length) await ins(prisma.projectMember.createMany.bind(prisma.projectMember), members)
        const exts = (data.projects as ProjRow[]).flatMap((p) => (p.extensions as unknown[] | undefined) ?? [])
        if (exts.length) await ins(prisma.projectExtension.createMany.bind(prisma.projectExtension), exts)
      }
      if (data.tags && want('tags')) {
        await ins(prisma.tag.createMany.bind(prisma.tag), data.tags as unknown[])
        summary.tags = (data.tags as unknown[]).length
      }
      if (data.milestones && want('milestones')) {
        await ins(prisma.projectMilestone.createMany.bind(prisma.projectMilestone), data.milestones as unknown[])
        summary.milestones = (data.milestones as unknown[]).length
      }
      if (data.tasks && want('tasks')) {
        type TaskRow = { tags?: unknown; checklist?: unknown; comments?: unknown; evidence?: unknown; statusChanges?: unknown; blockedBy?: unknown; [k: string]: unknown }
        const tasks = (data.tasks as TaskRow[]).map(({ tags: _t, checklist: _c, comments: _cm, evidence: _e, statusChanges: _s, blockedBy: _b, ...t }) => t)
        await ins(prisma.task.createMany.bind(prisma.task), tasks)
        summary.tasks = tasks.length
        const taskTags = (data.tasks as TaskRow[]).flatMap((t) => ((t.tags as Array<{ tagId: string }> | undefined) ?? []).map((tt) => ({ taskId: t.id as string, tagId: tt.tagId })))
        if (taskTags.length) await ins(prisma.taskTag.createMany.bind(prisma.taskTag), taskTags)
        const checklists = (data.tasks as TaskRow[]).flatMap((t) => (t.checklist as unknown[] | undefined) ?? [])
        if (checklists.length) await ins(prisma.taskChecklistItem.createMany.bind(prisma.taskChecklistItem), checklists)
        const comments = (data.tasks as TaskRow[]).flatMap((t) => (t.comments as unknown[] | undefined) ?? [])
        if (comments.length) await ins(prisma.taskComment.createMany.bind(prisma.taskComment), comments)
        const evidence = (data.tasks as TaskRow[]).flatMap((t) => (t.evidence as unknown[] | undefined) ?? [])
        if (evidence.length) await ins(prisma.taskEvidence.createMany.bind(prisma.taskEvidence), evidence)
        const statusChanges = (data.tasks as TaskRow[]).flatMap((t) => (t.statusChanges as unknown[] | undefined) ?? [])
        if (statusChanges.length) await ins(prisma.taskStatusChange.createMany.bind(prisma.taskStatusChange), statusChanges)
        const deps = (data.tasks as TaskRow[]).flatMap((t) => (t.blockedBy as unknown[] | undefined) ?? [])
        if (deps.length) await ins(prisma.taskDependency.createMany.bind(prisma.taskDependency), deps)
      }
      if (data.agents && want('agents')) {
        await ins(prisma.agent.createMany.bind(prisma.agent), data.agents as unknown[])
        summary.agents = (data.agents as unknown[]).length
      }
      if (data.activityEvents && want('activityEvents')) {
        await ins(prisma.activityEvent.createMany.bind(prisma.activityEvent), data.activityEvents as unknown[])
        summary.activityEvents = (data.activityEvents as unknown[]).length
      }
      if (data.webhookTokens && want('webhookTokens')) {
        const rows = (data.webhookTokens as Array<Record<string, unknown>>).map((t) => ({ ...t, tokenHash: `synced-${t.id}` }))
        await ins(prisma.webhookToken.createMany.bind(prisma.webhookToken), rows)
        summary.webhookTokens = rows.length
      }

      const ip = getIp(request)
      appLog('info', `Sync pull from ${remoteUrl} by userId=${session.user.id} — entities: ${entities.join(',') || 'all'}`, ip)
      await prisma.auditLog.create({ data: { userId: session.user.id, action: 'SYNC_FROM_STG', detail: remoteUrl, ip } }).catch(() => {})
      return { ok: true, summary }
    })
}
