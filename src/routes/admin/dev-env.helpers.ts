import * as fs from 'node:fs'
import * as path from 'node:path'

const ENV_DEFS = [
  { name: 'DATABASE_URL', envKey: 'DATABASE_URL', required: true, default: null, category: 'database', description: 'PostgreSQL connection string' },
  { name: 'REDIS_URL', envKey: 'REDIS_URL', required: true, default: null, category: 'cache', description: 'Redis connection string' },
  { name: 'GOOGLE_CLIENT_ID', envKey: 'GOOGLE_CLIENT_ID', required: true, default: null, category: 'auth', description: 'Google OAuth client ID' },
  { name: 'GOOGLE_CLIENT_SECRET', envKey: 'GOOGLE_CLIENT_SECRET', required: true, default: null, category: 'auth', description: 'Google OAuth client secret' },
  { name: 'SUPER_ADMIN_EMAIL', envKey: 'SUPER_ADMIN_EMAIL', required: false, default: '(empty)', category: 'auth', description: 'Comma-separated emails to auto-promote to SUPER_ADMIN' },
  { name: 'PORT', envKey: 'PORT', required: false, default: '3000', category: 'app', description: 'Server port' },
  { name: 'NODE_ENV', envKey: 'NODE_ENV', required: false, default: 'development', category: 'app', description: 'Environment mode' },
  { name: 'REACT_EDITOR', envKey: 'REACT_EDITOR', required: false, default: 'code', category: 'app', description: 'Editor for click-to-source' },
  { name: 'AUDIT_LOG_RETENTION_DAYS', envKey: 'AUDIT_LOG_RETENTION_DAYS', required: false, default: '90', category: 'app', description: 'Days to keep audit logs' },
  { name: 'MCP_SECRET', envKey: 'MCP_SECRET', required: false, default: '(empty)', category: 'mcp', description: 'Shared secret for MCP (local + /mcp HTTP). Scope gated by NODE_ENV: production=readonly, else=admin.' },
  { name: 'GITHUB_WEBHOOK_SECRET', envKey: 'GITHUB_WEBHOOK_SECRET', required: false, default: '(empty)', category: 'webhooks', description: 'HMAC SHA-256 secret for /webhooks/github signature verification' },
  { name: 'UPLOADS_DIR', envKey: 'UPLOADS_DIR', required: false, default: './uploads', category: 'app', description: 'Local directory for task evidence uploads' },
  { name: 'UPLOAD_MAX_BYTES', envKey: 'UPLOAD_MAX_BYTES', required: false, default: '10485760', category: 'app', description: 'Max evidence upload size in bytes (default 10 MiB)' },
  { name: 'DIRECT_URL', envKey: 'DIRECT_URL', required: false, default: '(same as DATABASE_URL)', category: 'database', description: 'Prisma direct URL (bypasses connection pool for migrations)' },
]

const SRC_FILES = ['src/lib/env.ts', 'src/lib/db.ts', 'src/lib/redis.ts', 'src/lib/applog.ts', 'src/app.ts', 'src/index.tsx', 'src/vite.ts']

export function computeEnvMap(root: string) {
  const fileContents: Record<string, string> = {}
  for (const f of SRC_FILES) {
    const absPath = path.join(root, f)
    if (fs.existsSync(absPath)) fileContents[f] = fs.readFileSync(absPath, 'utf-8')
  }
  const variables = ENV_DEFS.map((def) => {
    const usedBy: string[] = []
    for (const [file, content] of Object.entries(fileContents)) {
      if (content.includes(def.envKey) || content.includes(`env.${def.name}`)) usedBy.push(file)
    }
    return { name: def.name, required: def.required, isSet: !!process.env[def.envKey], default: def.default, category: def.category, description: def.description, usedBy }
  })
  const byCategory: Record<string, number> = {}
  let setCount = 0
  let requiredCount = 0
  for (const v of variables) {
    byCategory[v.category] = (byCategory[v.category] || 0) + 1
    if (v.isSet) setCount++
    if (v.required) requiredCount++
  }
  return { variables, summary: { total: variables.length, set: setCount, unset: variables.length - setCount, required: requiredCount, byCategory } }
}

interface SrcFile { path: string; lines: number; exports: string[]; testedBy: string[]; coverage: string }
interface TestFile { path: string; lines: number; type: string; targets: string[] }

const SKIP_DIRS = new Set(['node_modules', 'dist', 'generated', '.git'])
const EXTS = new Set(['.ts', '.tsx'])

function scanDir(root: string, dir: string, collect: string[]) {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) return
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const rel = path.join(dir, entry.name).replace(/\\/g, '/')
    if (entry.isDirectory()) scanDir(root, rel, collect)
    else if (EXTS.has(path.extname(entry.name))) collect.push(rel)
  }
}

export function computeTestCoverage(root: string) {
  const srcPaths: string[] = []
  scanDir(root, 'src', srcPaths)
  const srcFiltered = srcPaths.filter((f) => !f.includes('routeTree.gen'))

  const testPaths: string[] = []
  scanDir(root, 'tests', testPaths)
  const testFiltered = testPaths.filter((f) => f.includes('.test.'))

  const testFiles: TestFile[] = testFiltered.map((tp) => {
    const content = fs.readFileSync(path.join(root, tp), 'utf-8')
    const lines = content.split('\n').length
    const type = tp.includes('/unit/') ? 'unit' : tp.includes('/integration/') ? 'integration' : 'other'
    const targets: string[] = []
    for (const m of content.matchAll(/from\s+['"]([^'"]*(?:src|lib)[^'"]*)['"]/g)) {
      let resolved = m[1].replace(/^.*?src\//, 'src/')
      if (resolved.startsWith('.')) {
        resolved = path.normalize(path.join(path.dirname(tp), resolved)).replace(/\\/g, '/')
      }
      for (const ext of ['', '.ts', '.tsx']) {
        const full = resolved + ext
        if (srcFiltered.includes(full)) { targets.push(full); break }
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
    const content = fs.readFileSync(path.join(root, sp), 'utf-8')
    const lines = content.split('\n').length
    const exports: string[] = []
    for (const m of content.matchAll(/export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g)) {
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
    summary: { totalSource: sourceFiles.length, totalTests: testFiles.length, covered, partial, uncovered, coveragePercent: Math.round(((covered + partial * 0.5) / sourceFiles.length) * 100) },
  }
}
