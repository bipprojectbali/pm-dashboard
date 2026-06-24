import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { extractSessionToken } from '../../lib/route-helpers'

export function adminDevGraphRoutes() {
  return (
    new Elysia()

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
          elysia: 'server', '@elysiajs/cors': 'server', '@elysiajs/html': 'server',
          react: 'ui', 'react-dom': 'ui', '@mantine/core': 'ui', '@mantine/hooks': 'ui',
          '@tanstack/react-router': 'ui', '@tanstack/react-query': 'ui', '@xyflow/react': 'ui', 'react-icons': 'ui',
          '@prisma/client': 'database', prisma: 'database',
          vite: 'build', typescript: 'build', '@biomejs/biome': 'build', '@vitejs/plugin-react': 'build', '@tanstack/router-plugin': 'build',
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
        let runtime = 0, dev = 0
        for (const p of allPkgs) {
          byCategory[p.category] = (byCategory[p.category] || 0) + 1
          if (p.type === 'runtime') runtime++
          else dev++
        }

        return { packages: allPkgs, summary: { total: allPkgs.length, runtime, dev, byCategory } }
      })

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
          return { migrations: [], summary: { totalMigrations: 0, firstMigration: null, lastMigration: null, totalChanges: 0 } }
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

          return { name: entry.name.substring(15), folder: entry.name, createdAt, changes, sql: sql.substring(0, 800) }
        })

        const totalChanges = migrations.reduce((s, m) => s + m.changes.length, 0)
        return {
          migrations,
          summary: { totalMigrations: migrations.length, firstMigration: migrations[0]?.createdAt || null, lastMigration: migrations[migrations.length - 1]?.createdAt || null, totalChanges },
        }
      })
  )
}
