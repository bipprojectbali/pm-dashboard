import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CAT_MAP: Record<string, string> = {
  elysia: 'server', '@elysiajs/cors': 'server', '@elysiajs/html': 'server',
  react: 'ui', 'react-dom': 'ui', '@mantine/core': 'ui', '@mantine/hooks': 'ui',
  '@tanstack/react-router': 'ui', '@tanstack/react-query': 'ui', '@xyflow/react': 'ui', 'react-icons': 'ui',
  '@prisma/client': 'database', prisma: 'database',
  vite: 'build', typescript: 'build', '@biomejs/biome': 'build', '@vitejs/plugin-react': 'build', '@tanstack/router-plugin': 'build',
}

function scanTsFiles(root: string, dir: string, out: string[] = []): string[] {
  const abs = join(root, dir)
  if (!existsSync(abs)) return out
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'generated', '.git'].includes(e.name)) continue
    const rel = join(dir, e.name).replace(/\\/g, '/')
    if (e.isDirectory()) scanTsFiles(root, rel, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}

export function computeDependencies(root: string) {
  const pkgPath = join(root, 'package.json')
  if (!existsSync(pkgPath)) return null

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const deps: Record<string, string> = pkg.dependencies || {}
  const devDeps: Record<string, string> = pkg.devDependencies || {}

  const srcFiles = scanTsFiles(root, 'src')
  const fileContents: Record<string, string> = {}
  for (const f of srcFiles) fileContents[f] = readFileSync(join(root, f), 'utf-8')

  const packages: { name: string; version: string; type: string; category: string; usedBy: string[] }[] = []

  for (const [name, version] of Object.entries(deps)) {
    const re = new RegExp(`from\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    const usedBy = Object.entries(fileContents)
      .filter(([, content]) => re.test(content))
      .map(([file]) => file)
    packages.push({ name, version, type: 'runtime', category: CAT_MAP[name] || 'other', usedBy })
  }

  for (const [name, version] of Object.entries(devDeps)) {
    packages.push({ name, version, type: 'dev', category: CAT_MAP[name] || 'build', usedBy: [] })
  }

  const byCategory: Record<string, number> = {}
  let runtime = 0, dev = 0
  for (const p of packages) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1
    if (p.type === 'runtime') { runtime++ } else { dev++ }
  }

  return { packages, summary: { total: packages.length, runtime, dev, byCategory } }
}

export function computeMigrations(root: string) {
  const migrationsDir = join(root, 'prisma/migrations')
  const empty = { migrations: [], summary: { totalMigrations: 0, firstMigration: null, lastMigration: null, totalChanges: 0 } }

  if (!existsSync(migrationsDir)) return empty

  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const migrations = entries.map((entry) => {
    const sqlPath = join(migrationsDir, entry.name, 'migration.sql')
    let sql = ''
    const changes: string[] = []

    if (existsSync(sqlPath)) {
      sql = readFileSync(sqlPath, 'utf-8')
      for (const m of sql.matchAll(
        /^(CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX|DROP TABLE|DROP INDEX|CREATE TYPE|ALTER TYPE)\s+["']?(\w+)["']?/gim,
      )) changes.push(`${m[1]} ${m[2]}`)
      for (const m of sql.matchAll(/CREATE TYPE\s+"(\w+)"/g)) {
        if (!changes.some((c) => c.includes(m[1]))) changes.push(`CREATE TYPE ${m[1]}`)
      }
    }

    const d = entry.name.substring(0, 14)
    const createdAt = new Date(
      `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}.000Z`,
    ).toISOString()

    return { name: entry.name.substring(15), folder: entry.name, createdAt, changes, sql: sql.substring(0, 800) }
  })

  const totalChanges = migrations.reduce((s, m) => s + m.changes.length, 0)
  return {
    migrations,
    summary: { totalMigrations: migrations.length, firstMigration: migrations[0]?.createdAt ?? null, lastMigration: migrations[migrations.length - 1]?.createdAt ?? null, totalChanges },
  }
}
