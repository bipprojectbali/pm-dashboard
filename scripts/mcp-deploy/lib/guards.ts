import { PROJECT_ROOT, STG_BASE_URL, git } from './utils'

const ENV_LEAK_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { name: 'OpenAI / Anthropic style key', re: /\bsk-(?:ant-)?[A-Za-z0-9\-_]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'Project access token', re: /\bpmt_[A-Za-z0-9\-_]{30,}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Hardcoded password=', re: /\bpassword\s*[:=]\s*["'][^"'\s]{6,}["']/i },
  { name: 'Postgres/Redis URL with password', re: /\b(?:postgres(?:ql)?|redis):\/\/[^\s:@]+:[^\s@]+@[^\s]+/ },
]

const ENV_LEAK_ALLOWLIST = [
  /^\.env\.example$/,
  /^tests\/fixtures\//,
  /\.test\.ts$/,
  /\.test\.tsx$/,
  /^CLAUDE\.md$/,
  /^prisma\/seed\.ts$/,
]

export interface EnvLeakHit {
  file: string
  pattern: string
  line: number
  preview: string
}

function isAllowlisted(file: string): boolean {
  return ENV_LEAK_ALLOWLIST.some((re) => re.test(file))
}

export async function scanEnvLeaks(diffRange: string): Promise<{
  ok: boolean
  newDotEnv: string[]
  hits: EnvLeakHit[]
  summary: string
}> {
  const names = await git(['diff', '--name-only', '--diff-filter=AM', diffRange])
  if (!names.ok) {
    return {
      ok: false,
      newDotEnv: [],
      hits: [],
      summary: `git diff --name-only failed: ${names.stderr || names.stdout}`,
    }
  }
  const files = names.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
  const newDotEnv = files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f))

  const hits: EnvLeakHit[] = []
  for (const file of files) {
    if (isAllowlisted(file)) continue
    if (!/\.(ts|tsx|js|jsx|json|yml|yaml|toml|md|env|sh|prisma)$/i.test(file) && !/Dockerfile$/i.test(file)) continue
    const diff = await git(['diff', '--unified=0', diffRange, '--', file])
    if (!diff.ok) continue
    const lines = diff.stdout.split('\n')
    let lineNo = 0
    for (const line of lines) {
      const h = /^@@ .* \+(\d+)(?:,\d+)? @@/.exec(line)
      if (h) { lineNo = Number.parseInt(h[1], 10); continue }
      if (!line.startsWith('+') || line.startsWith('+++')) {
        if (line.startsWith(' ')) lineNo++
        continue
      }
      const added = line.slice(1)
      for (const p of ENV_LEAK_PATTERNS) {
        if (p.re.test(added)) {
          hits.push({ file, pattern: p.name, line: lineNo, preview: added.length > 160 ? `${added.slice(0, 157)}...` : added })
        }
      }
      lineNo++
    }
  }

  const ok = newDotEnv.length === 0 && hits.length === 0
  const parts: string[] = []
  if (newDotEnv.length) parts.push(`${newDotEnv.length} .env file(s) added: ${newDotEnv.join(', ')}`)
  if (hits.length) parts.push(`${hits.length} credential pattern match(es)`)
  return { ok, newDotEnv, hits, summary: ok ? 'no env leaks detected' : parts.join('; ') }
}

export async function checkMigrationDrift(): Promise<{
  ok: boolean
  reason: 'none' | 'drift' | 'error' | 'no-shadow'
  summary: string
  detail: string
}> {
  const shadow = process.env.SHADOW_DATABASE_URL
  if (!shadow) {
    return {
      ok: false,
      reason: 'no-shadow',
      summary:
        'SHADOW_DATABASE_URL not set — prisma migrate diff needs a throwaway database to replay migrations against. Set SHADOW_DATABASE_URL in .env to a separate empty DB on your postgres server (e.g. postgresql://user:pass@host:5432/pm_shadow).',
      detail: '',
    }
  }
  const proc = Bun.spawn(
    [
      'bunx', 'prisma', 'migrate', 'diff',
      '--from-migrations', 'prisma/migrations',
      '--to-schema-datamodel', 'prisma/schema.prisma',
      '--shadow-database-url', shadow,
      '--exit-code',
    ],
    { cwd: PROJECT_ROOT, stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  const detail = (stdout + stderr).trim()
  if (code === 0) return { ok: true, reason: 'none', summary: 'no drift', detail: '' }
  if (code === 2) {
    return {
      ok: false,
      reason: 'drift',
      summary:
        'prisma/schema.prisma has changes not captured in prisma/migrations — run `bun run db:migrate --name <desc>` to generate one, commit it, then redeploy',
      detail,
    }
  }
  return { ok: false, reason: 'error', summary: `prisma migrate diff exited ${code}`, detail }
}

export async function fetchStgVersion(): Promise<{
  ok: boolean
  status: number
  url: string
  body: { name?: string; version?: string; commit?: string | null; builtAt?: string | null; env?: string } | null
  error: string | null
}> {
  const url = `${STG_BASE_URL}/api/version`
  try {
    const ctrl = AbortSignal.timeout(10_000)
    const r = await fetch(url, { signal: ctrl, headers: { accept: 'application/json' } })
    if (!r.ok) return { ok: false, status: r.status, url, body: null, error: `HTTP ${r.status}` }
    const body = (await r.json()) as {
      name?: string; version?: string; commit?: string | null; builtAt?: string | null; env?: string
    }
    return { ok: true, status: r.status, url, body, error: null }
  } catch (e) {
    return { ok: false, status: 0, url, body: null, error: e instanceof Error ? e.message : String(e) }
  }
}
