import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const REPO = process.env.GH_DEPLOY_REPO ?? 'bipprojectbali/pm-dashboard'
const PUBLISH_WORKFLOW = process.env.GH_PUBLISH_WORKFLOW ?? 'Publish Docker to GHCR'
const REPULL_WORKFLOW = process.env.GH_REPULL_WORKFLOW ?? 'Re-Pull Docker'
const PROJECT_ROOT = process.env.GH_DEPLOY_ROOT ?? process.cwd()
const STG_BASE_URL = (process.env.STG_BASE_URL ?? 'https://pm-dashboard.wibudev.com').replace(/\/+$/, '')

const ENV_LEAK_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { name: 'OpenAI / Anthropic style key', re: /\bsk-(?:ant-)?[A-Za-z0-9\-_]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
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

async function gh(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(['gh', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { ok: code === 0, stdout, stderr, code }
}

async function git(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(['git', ...args], { cwd: PROJECT_ROOT, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { ok: code === 0, stdout, stderr, code }
}

async function readLocalVersion(): Promise<string> {
  const pkg = (await Bun.file(`${PROJECT_ROOT}/package.json`).json()) as { version: string }
  if (typeof pkg.version !== 'string') throw new Error('package.json has no string version')
  return pkg.version
}

function deployTagName(env: 'dev' | 'stg' | 'prod', version: string): string {
  return `${env}-v${version}`
}

async function stgTagExists(tagName: string): Promise<boolean> {
  const r = await git(['ls-remote', '--tags', 'origin', `refs/tags/${tagName}`])
  return r.ok && r.stdout.trim().length > 0
}

async function currentBranch(): Promise<string> {
  const r = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return r.stdout.trim()
}

async function workingTreeClean(): Promise<{ clean: boolean; detail: string }> {
  const r = await git(['status', '--porcelain'])
  return { clean: r.stdout.trim().length === 0, detail: r.stdout.trim() }
}

async function localIsPushed(branch: string): Promise<{ pushed: boolean; local: string; remote: string }> {
  await git(['fetch', 'origin', branch])
  const local = (await git(['rev-parse', 'HEAD'])).stdout.trim()
  const remote = (await git(['rev-parse', `origin/${branch}`])).stdout.trim()
  return { pushed: local === remote, local, remote }
}

async function checkMigrationDrift(): Promise<{
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

async function pushDeployTag(tagName: string): Promise<{ ok: boolean; message: string }> {
  const create = await git(['tag', tagName])
  if (!create.ok && !create.stderr.includes('already exists')) {
    return { ok: false, message: `git tag failed: ${create.stderr}` }
  }
  const push = await git(['push', 'origin', tagName])
  return { ok: push.ok, message: push.stderr.trim() || push.stdout.trim() }
}

interface EnvLeakHit {
  file: string
  pattern: string
  line: number
  preview: string
}

function isAllowlisted(file: string): boolean {
  return ENV_LEAK_ALLOWLIST.some((re) => re.test(file))
}

async function scanEnvLeaks(diffRange: string): Promise<{
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
  const files = names.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

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
      if (h) {
        lineNo = Number.parseInt(h[1], 10)
        continue
      }
      if (!line.startsWith('+') || line.startsWith('+++')) {
        if (line.startsWith(' ')) lineNo++
        continue
      }
      const added = line.slice(1)
      for (const p of ENV_LEAK_PATTERNS) {
        if (p.re.test(added)) {
          hits.push({
            file,
            pattern: p.name,
            line: lineNo,
            preview: added.length > 160 ? `${added.slice(0, 157)}...` : added,
          })
        }
      }
      lineNo++
    }
  }

  const ok = newDotEnv.length === 0 && hits.length === 0
  const parts: string[] = []
  if (newDotEnv.length) parts.push(`${newDotEnv.length} .env file(s) added: ${newDotEnv.join(', ')}`)
  if (hits.length) parts.push(`${hits.length} credential pattern match(es)`)
  const summary = ok ? 'no env leaks detected' : parts.join('; ')
  return { ok, newDotEnv, hits, summary }
}

async function fetchStgVersion(): Promise<{
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
    if (!r.ok) {
      return { ok: false, status: r.status, url, body: null, error: `HTTP ${r.status}` }
    }
    const body = (await r.json()) as {
      name?: string
      version?: string
      commit?: string | null
      builtAt?: string | null
      env?: string
    }
    return { ok: true, status: r.status, url, body, error: null }
  } catch (e) {
    return { ok: false, status: 0, url, body: null, error: e instanceof Error ? e.message : String(e) }
  }
}

function jsonText(data: unknown) {
  return {
    content: [
      { type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) },
    ],
  }
}

function errText(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] }
}

async function latestRun(workflow: string) {
  const res = await gh([
    'run', 'list',
    '--repo', REPO,
    '--workflow', workflow,
    '--limit', '1',
    '--json', 'databaseId,status,conclusion,url,headBranch,createdAt,displayTitle',
  ])
  if (!res.ok) return null
  const arr = JSON.parse(res.stdout) as unknown[]
  return (arr[0] as Record<string, unknown>) ?? null
}

const server = new McpServer({ name: 'deploy-stg', version: '0.2.0' })

server.registerTool(
  'publish_docker',
  {
    title: 'Trigger Publish Docker workflow',
    description:
      'Dispatch the "Publish Docker to GHCR" workflow on GitHub Actions. Builds and pushes a tagged image to GHCR. Returns the new run id + URL so you can poll.',
    inputSchema: {
      stack_env: z.enum(['dev', 'stg', 'prod']).describe('Target env (also used as the branch ref).'),
      tag: z.string().describe('Image tag, e.g. "0.1.2" (combined with env as "stg-0.1.2").'),
      ref: z.string().optional().describe('Override branch ref (default = stack_env).'),
    },
  },
  async ({ stack_env, tag, ref }) => {
    const dispatch = await gh([
      'workflow', 'run', PUBLISH_WORKFLOW,
      '--repo', REPO,
      '--ref', ref ?? stack_env,
      '-f', `stack_env=${stack_env}`,
      '-f', `tag=${tag}`,
    ])
    if (!dispatch.ok) return errText(`gh workflow run failed (exit ${dispatch.code}): ${dispatch.stderr || dispatch.stdout}`)
    await Bun.sleep(3000)
    const run = await latestRun(PUBLISH_WORKFLOW)
    return jsonText({ triggered: true, dispatchOutput: dispatch.stdout.trim(), run })
  },
)

server.registerTool(
  're_pull',
  {
    title: 'Trigger Re-Pull Docker workflow',
    description:
      'Dispatch the "Re-Pull Docker" workflow on GitHub Actions. Tells Portainer to pull the latest tagged image and redeploy the stack. Returns the new run id + URL.',
    inputSchema: {
      stack_name: z.string().default('pm-dashboard').describe('Portainer stack base name.'),
      stack_env: z.enum(['dev', 'stg', 'prod']).describe('Target env (suffix on stack name).'),
      ref: z.string().optional().describe('Override branch ref (default = stack_env).'),
    },
  },
  async ({ stack_name, stack_env, ref }) => {
    const dispatch = await gh([
      'workflow', 'run', REPULL_WORKFLOW,
      '--repo', REPO,
      '--ref', ref ?? stack_env,
      '-f', `stack_name=${stack_name}`,
      '-f', `stack_env=${stack_env}`,
    ])
    if (!dispatch.ok) return errText(`gh workflow run failed (exit ${dispatch.code}): ${dispatch.stderr || dispatch.stdout}`)
    await Bun.sleep(3000)
    const run = await latestRun(REPULL_WORKFLOW)
    return jsonText({ triggered: true, dispatchOutput: dispatch.stdout.trim(), run })
  },
)

server.registerTool(
  'run_status',
  {
    title: 'Get workflow run status',
    description: 'Return status + conclusion for a given run id.',
    inputSchema: {
      run_id: z.string().describe('Numeric GitHub run id.'),
    },
  },
  async ({ run_id }) => {
    const res = await gh([
      'run', 'view', run_id,
      '--repo', REPO,
      '--json', 'databaseId,status,conclusion,name,displayTitle,url,createdAt,updatedAt,headBranch,event',
    ])
    if (!res.ok) return errText(`gh run view failed: ${res.stderr || res.stdout}`)
    return jsonText(JSON.parse(res.stdout))
  },
)

server.registerTool(
  'run_wait',
  {
    title: 'Wait for workflow run to finish',
    description:
      'Poll until the run leaves status in_progress/queued. Returns final status, conclusion, and whether it timed out.',
    inputSchema: {
      run_id: z.string(),
      timeout_seconds: z.number().int().min(30).max(1800).default(900).optional().describe('Max wait (default 900s / 15 min).'),
      poll_seconds: z.number().int().min(5).max(60).default(15).optional().describe('Poll interval (default 15s).'),
    },
  },
  async ({ run_id, timeout_seconds = 900, poll_seconds = 15 }) => {
    const deadline = Date.now() + timeout_seconds * 1000
    let last: { status: string; conclusion: string | null } = { status: 'unknown', conclusion: null }
    while (Date.now() < deadline) {
      const res = await gh([
        'run', 'view', run_id,
        '--repo', REPO,
        '--json', 'status,conclusion',
      ])
      if (!res.ok) return errText(`gh run view failed: ${res.stderr || res.stdout}`)
      last = JSON.parse(res.stdout)
      if (last.status !== 'in_progress' && last.status !== 'queued') {
        return jsonText({ run_id, ...last, timedOut: false })
      }
      await Bun.sleep(poll_seconds * 1000)
    }
    return jsonText({ run_id, ...last, timedOut: true })
  },
)

server.registerTool(
  'run_logs',
  {
    title: 'Fetch workflow run logs',
    description: 'Return failed-step logs by default (or full logs). Tailed to last N lines.',
    inputSchema: {
      run_id: z.string(),
      failed_only: z.boolean().default(true).optional(),
      tail_lines: z.number().int().min(20).max(2000).default(200).optional(),
    },
  },
  async ({ run_id, failed_only = true, tail_lines = 200 }) => {
    const args = ['run', 'view', run_id, '--repo', REPO, failed_only ? '--log-failed' : '--log']
    const res = await gh(args)
    if (!res.ok) return errText(`gh run logs failed: ${res.stderr || res.stdout}`)
    const lines = res.stdout.split('\n')
    const tailed = lines.slice(-tail_lines).join('\n')
    return jsonText({ run_id, failed_only, shown: Math.min(lines.length, tail_lines), total: lines.length, text: tailed })
  },
)

server.registerTool(
  'run_list',
  {
    title: 'List recent workflow runs',
    description: 'Recent runs, optionally filtered by workflow.',
    inputSchema: {
      workflow: z.enum(['publish', 're-pull', 'all']).default('all').optional(),
      limit: z.number().int().min(1).max(50).default(10).optional(),
    },
  },
  async ({ workflow = 'all', limit = 10 }) => {
    const args = [
      'run', 'list',
      '--repo', REPO,
      '--limit', String(limit),
      '--json', 'databaseId,status,conclusion,name,displayTitle,url,createdAt,event,headBranch',
    ]
    if (workflow === 'publish') args.push('--workflow', PUBLISH_WORKFLOW)
    if (workflow === 're-pull') args.push('--workflow', REPULL_WORKFLOW)
    const res = await gh(args)
    if (!res.ok) return errText(`gh run list failed: ${res.stderr || res.stdout}`)
    return jsonText(JSON.parse(res.stdout))
  },
)

server.registerTool(
  'deploy_stg',
  {
    title: 'Full stg deploy (preflight → publish → re-pull → verify)',
    description:
      'End-to-end stg deploy guarded by preflight checks. Flow: env-leak scan + branch/clean/sync/migration-drift/version-tag guards → dispatch Publish workflow (tag = package.json version) → wait → dispatch Re-Pull workflow → wait → verify stg /api/version reports the new version → push stg-v<version> git tag on origin. Rejects if version was already deployed (unless force=true). Bump first with bump_version.',
    inputSchema: {
      stack_name: z.string().default('pm-dashboard').optional(),
      publish_timeout_seconds: z.number().int().min(60).max(1800).default(900).optional(),
      repull_timeout_seconds: z.number().int().min(60).max(1800).default(600).optional(),
      verify_timeout_seconds: z.number().int().min(10).max(600).default(180).optional(),
      force: z.boolean().default(false).optional().describe('Skip version-already-deployed guard.'),
      skip_migration_check: z
        .boolean()
        .default(false)
        .optional()
        .describe('Skip the prisma schema↔migrations drift guard (emergency only).'),
      skip_env_leak_check: z
        .boolean()
        .default(false)
        .optional()
        .describe('Skip the env/credential leak scan against origin/stg (emergency only).'),
      skip_verify: z
        .boolean()
        .default(false)
        .optional()
        .describe('Skip the post-deploy /api/version check (e.g. if stg is unreachable from dev machine).'),
    },
  },
  async ({
    stack_name = 'pm-dashboard',
    publish_timeout_seconds = 900,
    repull_timeout_seconds = 600,
    verify_timeout_seconds = 180,
    force = false,
    skip_migration_check = false,
    skip_env_leak_check = false,
    skip_verify = false,
  }) => {
    const branch = await currentBranch()
    if (branch !== 'stg') return errText(`must be on branch "stg" to deploy stg (current: "${branch}")`)

    const tree = await workingTreeClean()
    if (!tree.clean) {
      return errText(
        `working tree not clean — commit or stash before deploying:\n${tree.detail}`,
      )
    }

    const sync = await localIsPushed('stg')
    if (!sync.pushed) {
      return errText(
        `local stg is not in sync with origin/stg — push first.\n  local:  ${sync.local}\n  remote: ${sync.remote}`,
      )
    }

    if (!skip_env_leak_check) {
      const leak = await scanEnvLeaks('origin/stg...HEAD')
      if (!leak.ok) {
        const lines: string[] = [`env-leak scan blocked deploy — ${leak.summary}`]
        if (leak.newDotEnv.length) lines.push(`\nNew .env files added:\n  - ${leak.newDotEnv.join('\n  - ')}`)
        if (leak.hits.length) {
          lines.push('\nCredential-pattern matches:')
          for (const h of leak.hits.slice(0, 20)) {
            lines.push(`  - ${h.file}:${h.line} [${h.pattern}] ${h.preview}`)
          }
          if (leak.hits.length > 20) lines.push(`  … ${leak.hits.length - 20} more`)
        }
        lines.push(
          '\nIf these are false positives (e.g. test fixtures), add them to ENV_LEAK_ALLOWLIST in scripts/mcp-deploy/server.ts. Pass skip_env_leak_check: true to bypass (emergency only).',
        )
        return errText(lines.join('\n'))
      }
    }

    if (!skip_migration_check) {
      const drift = await checkMigrationDrift()
      if (!drift.ok) {
        return errText(
          `migration drift blocked deploy — ${drift.summary}\n\n${drift.detail}\n\n` +
            `Pass skip_migration_check: true to bypass (emergency only — the migrate sidecar will not catch up automatically).`,
        )
      }
    }

    const version = await readLocalVersion()
    const tag = version
    const tagName = deployTagName('stg', version)

    if (!force && (await stgTagExists(tagName))) {
      return errText(
        `version ${version} was already deployed to stg (git tag ${tagName} exists on origin). ` +
          `Bump first: bump_version({ level: "patch" | "minor" | "major" }), then deploy again. ` +
          `Or pass force: true to redeploy the same version.`,
      )
    }

    const pubDispatch = await gh([
      'workflow', 'run', PUBLISH_WORKFLOW,
      '--repo', REPO, '--ref', 'stg',
      '-f', 'stack_env=stg', '-f', `tag=${tag}`,
    ])
    if (!pubDispatch.ok) return errText(`publish dispatch failed: ${pubDispatch.stderr || pubDispatch.stdout}`)
    await Bun.sleep(3000)
    const pubRun = await latestRun(PUBLISH_WORKFLOW)
    if (!pubRun) return errText('could not find publish run after dispatch')

    const pubId = String(pubRun.databaseId)
    const pubDeadline = Date.now() + publish_timeout_seconds * 1000
    let pubFinal: Record<string, unknown> = pubRun
    while (Date.now() < pubDeadline) {
      const r = await gh(['run', 'view', pubId, '--repo', REPO, '--json', 'status,conclusion,url'])
      if (!r.ok) return errText(`publish poll failed: ${r.stderr}`)
      pubFinal = JSON.parse(r.stdout)
      if (pubFinal.status !== 'in_progress' && pubFinal.status !== 'queued') break
      await Bun.sleep(20000)
    }
    if (pubFinal.conclusion !== 'success') {
      return jsonText({ stage: 'publish', version, publish: { run_id: pubId, ...pubFinal }, aborted: true })
    }

    const repullDispatch = await gh([
      'workflow', 'run', REPULL_WORKFLOW,
      '--repo', REPO, '--ref', 'stg',
      '-f', `stack_name=${stack_name}`, '-f', 'stack_env=stg',
    ])
    if (!repullDispatch.ok) return errText(`re-pull dispatch failed: ${repullDispatch.stderr || repullDispatch.stdout}`)
    await Bun.sleep(3000)
    const repullRun = await latestRun(REPULL_WORKFLOW)
    if (!repullRun) return errText('could not find re-pull run after dispatch')

    const repullId = String(repullRun.databaseId)
    const repullDeadline = Date.now() + repull_timeout_seconds * 1000
    let repullFinal: Record<string, unknown> = repullRun
    while (Date.now() < repullDeadline) {
      const r = await gh(['run', 'view', repullId, '--repo', REPO, '--json', 'status,conclusion,url'])
      if (!r.ok) return errText(`re-pull poll failed: ${r.stderr}`)
      repullFinal = JSON.parse(r.stdout)
      if (repullFinal.status !== 'in_progress' && repullFinal.status !== 'queued') break
      await Bun.sleep(10000)
    }

    let verify: {
      ok: boolean
      skipped?: boolean
      expected: string
      remote?: unknown
      url?: string
      lastResponse?: unknown
      timedOut?: boolean
      hint?: string
    } = { ok: false, skipped: true, expected: version }

    if (repullFinal.conclusion === 'success' && !skip_verify) {
      const verifyDeadline = Date.now() + verify_timeout_seconds * 1000
      let last: Awaited<ReturnType<typeof fetchStgVersion>> | null = null
      while (Date.now() < verifyDeadline) {
        last = await fetchStgVersion()
        if (last.ok && last.body?.version === version) {
          verify = { ok: true, expected: version, remote: last.body, url: last.url }
          break
        }
        await Bun.sleep(10_000)
      }
      if (!verify.ok) {
        verify = {
          ok: false,
          expected: version,
          lastResponse: last ?? undefined,
          timedOut: true,
          hint:
            last?.body?.version && last.body.version !== version
              ? `stg still reporting v${last.body.version} — image rollout may be slow or the new image failed to start`
              : 'stg /api/version unreachable or not returning JSON',
        }
      }
    } else if (skip_verify) {
      verify = { ok: true, skipped: true, expected: version }
    }

    const canTag = repullFinal.conclusion === 'success' && (skip_verify || verify.ok)
    const tagged = canTag
      ? await pushDeployTag(tagName)
      : {
          ok: false,
          message: repullFinal.conclusion !== 'success' ? 'skipped (re-pull did not succeed)' : 'skipped (verify_stg did not confirm new version)',
        }

    return jsonText({
      stage: 'done',
      version,
      publish: { run_id: pubId, ...pubFinal },
      re_pull: { run_id: repullId, ...repullFinal },
      verify,
      deploy_tag: { name: tagName, pushed: tagged.ok, message: tagged.message },
    })
  },
)

server.registerTool(
  'check_migrations',
  {
    title: 'Check prisma schema ↔ migrations drift',
    description:
      'Runs `prisma migrate diff --exit-code` to verify prisma/schema.prisma matches prisma/migrations. Returns ok=true when no drift. On drift, the reply includes the SQL/detail so you can see what migration is needed.',
    inputSchema: {},
  },
  async () => {
    const r = await checkMigrationDrift()
    return jsonText({ ok: r.ok, reason: r.reason, summary: r.summary, detail: r.detail })
  },
)

server.registerTool(
  'bump_version',
  {
    title: 'Bump package.json version and push',
    description:
      'Bumps package.json version (semver level or explicit value), commits "chore(release): vX.Y.Z", and pushes to origin. Run this before deploy_stg when you need a new deployable version. Refuses if working tree is dirty.',
    inputSchema: {
      level: z.enum(['patch', 'minor', 'major']).default('patch').optional(),
      version: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .optional()
        .describe('Explicit X.Y.Z. When set, overrides level.'),
      push: z.boolean().default(true).optional().describe('Push to origin after commit.'),
    },
  },
  async ({ level = 'patch', version, push = true }) => {
    const branch = await currentBranch()
    if (branch !== 'stg' && branch !== 'main' && branch !== 'prod') {
      return errText(`refusing to bump on branch "${branch}" — switch to stg/main/prod first`)
    }
    const tree = await workingTreeClean()
    if (!tree.clean) {
      return errText(`working tree not clean — commit or stash first:\n${tree.detail}`)
    }

    const pkgPath = `${PROJECT_ROOT}/package.json`
    const pkg = (await Bun.file(pkgPath).json()) as { version: string; [k: string]: unknown }
    const prev = pkg.version
    let next: string
    if (version) {
      next = version
    } else {
      const [maj, min, pat] = prev.split('.').map((n) => Number.parseInt(n, 10))
      if ([maj, min, pat].some((n) => Number.isNaN(n))) return errText(`cannot parse current version "${prev}"`)
      if (level === 'major') next = `${maj + 1}.0.0`
      else if (level === 'minor') next = `${maj}.${min + 1}.0`
      else next = `${maj}.${min}.${pat + 1}`
    }
    if (next === prev) return errText(`next version equals current (${prev}) — nothing to bump`)

    pkg.version = next
    await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

    const add = await git(['add', 'package.json'])
    if (!add.ok) return errText(`git add failed: ${add.stderr}`)
    const commit = await git(['commit', '-m', `chore(release): v${next}`])
    if (!commit.ok) return errText(`git commit failed: ${commit.stderr || commit.stdout}`)

    let pushed: { ok: boolean; message: string } = { ok: false, message: 'skipped' }
    if (push) {
      const p = await git(['push', 'origin', `HEAD:${branch}`])
      pushed = { ok: p.ok, message: p.stderr.trim() || p.stdout.trim() }
      if (!p.ok) return errText(`git push failed: ${pushed.message}`)
    }

    return jsonText({ bumped: true, previous: prev, next, branch, pushed })
  },
)

server.registerTool(
  'preflight_check',
  {
    title: 'Pre-deploy checks (env leak / branch / clean / sync / migrations / version)',
    description:
      'One-shot safety net before deploying. Verifies: (1) no new .env files or credential patterns in staged+unpushed changes, (2) currently on the target branch, (3) working tree clean, (4) local in sync with origin, (5) prisma schema ↔ migrations has no drift, (6) stg-v<version> tag does not already exist on origin. Returns ok=false with per-check reasons when any fail. Safe to call anytime; does not mutate state.',
    inputSchema: {
      target_branch: z.enum(['stg', 'prod', 'main']).default('stg').optional(),
      skip_migration_check: z.boolean().default(false).optional(),
      skip_env_leak_check: z.boolean().default(false).optional(),
    },
  },
  async ({ target_branch = 'stg', skip_migration_check = false, skip_env_leak_check = false }) => {
    const checks: Record<string, unknown> = {}
    let ok = true
    const problems: string[] = []

    const branch = await currentBranch()
    checks.branch = { current: branch, expected: target_branch, ok: branch === target_branch }
    if (branch !== target_branch) {
      ok = false
      problems.push(`branch "${branch}" ≠ "${target_branch}"`)
    }

    const tree = await workingTreeClean()
    checks.workingTree = { clean: tree.clean, detail: tree.clean ? '' : tree.detail }
    if (!tree.clean) {
      ok = false
      problems.push('working tree dirty')
    }

    const sync = await localIsPushed(target_branch)
    checks.inSync = sync
    if (!sync.pushed) {
      ok = false
      problems.push(`local ${target_branch} not pushed`)
    }

    if (!skip_env_leak_check) {
      const base = `origin/${target_branch}`
      const leak = await scanEnvLeaks(`${base}...HEAD`)
      checks.envLeak = leak
      if (!leak.ok) {
        ok = false
        problems.push(`env leak: ${leak.summary}`)
      }
    } else {
      checks.envLeak = { skipped: true }
    }

    if (!skip_migration_check) {
      const drift = await checkMigrationDrift()
      checks.migrations = drift
      if (!drift.ok) {
        ok = false
        problems.push(`migrations: ${drift.summary}`)
      }
    } else {
      checks.migrations = { skipped: true }
    }

    const version = await readLocalVersion()
    const tagName = deployTagName(target_branch === 'prod' ? 'prod' : target_branch === 'main' ? 'dev' : 'stg', version)
    const tagExists = await stgTagExists(tagName)
    checks.version = { local: version, deployTag: tagName, tagExists }
    if (tagExists) {
      ok = false
      problems.push(`deploy tag ${tagName} already exists — bump version first`)
    }

    return jsonText({ ok, problems, checks })
  },
)

server.registerTool(
  'verify_stg',
  {
    title: 'Verify stg /api/version matches local package.json',
    description:
      'Polls https://<STG_BASE_URL>/api/version until the reported version equals local package.json (default up to 120s, poll every 10s). Use after deploy_stg to confirm the new image is actually live. Returns ok=true + remote body on match; ok=false with last response on timeout.',
    inputSchema: {
      expected_version: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .optional()
        .describe('Explicit X.Y.Z to match. Defaults to local package.json.'),
      timeout_seconds: z.number().int().min(10).max(600).default(120).optional(),
      poll_seconds: z.number().int().min(2).max(30).default(10).optional(),
    },
  },
  async ({ expected_version, timeout_seconds = 120, poll_seconds = 10 }) => {
    const expected = expected_version ?? (await readLocalVersion())
    const deadline = Date.now() + timeout_seconds * 1000
    let last: Awaited<ReturnType<typeof fetchStgVersion>> | null = null
    while (Date.now() < deadline) {
      last = await fetchStgVersion()
      if (last.ok && last.body?.version === expected) {
        return jsonText({
          ok: true,
          expected,
          remote: last.body,
          url: last.url,
        })
      }
      await Bun.sleep(poll_seconds * 1000)
    }
    return jsonText({
      ok: false,
      expected,
      lastResponse: last,
      timedOut: true,
      hint:
        last?.body?.version && last.body.version !== expected
          ? `stg still reporting v${last.body.version} — image rollout may be slow or the new image failed to start`
          : 'stg /api/version unreachable or not returning JSON',
    })
  },
)

await server.connect(new StdioServerTransport())
