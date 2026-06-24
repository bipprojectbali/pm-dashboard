import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { checkMigrationDrift, fetchStgVersion, scanEnvLeaks } from '../lib/guards'
import {
  PROJECT_ROOT,
  currentBranch,
  deployTagName,
  errText,
  git,
  jsonText,
  localIsPushed,
  readLocalVersion,
  stgTagExists,
  workingTreeClean,
} from '../lib/utils'

export function registerBumpPreflightTools(server: McpServer) {
  server.registerTool(
    'bump_version',
    {
      title: 'Bump package.json version and push',
      description:
        'Bumps package.json version (semver level or explicit value), commits "chore(release): vX.Y.Z", and pushes to origin. Run this before deploy_stg when you need a new deployable version. Refuses if working tree is dirty.',
      inputSchema: {
        level: z.enum(['patch', 'minor', 'major']).default('patch').optional(),
        version: z.string().regex(/^\d+\.\d+\.\d+$/).optional().describe('Explicit X.Y.Z. When set, overrides level.'),
        push: z.boolean().default(true).optional().describe('Push to origin after commit.'),
      },
    },
    async ({ level = 'patch', version, push = true }) => {
      const branch = await currentBranch()
      if (branch !== 'stg' && branch !== 'main' && branch !== 'prod') {
        return errText(`refusing to bump on branch "${branch}" — switch to stg/main/prod first`)
      }
      const tree = await workingTreeClean()
      if (!tree.clean) return errText(`working tree not clean — commit or stash first:\n${tree.detail}`)

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
      if (branch !== target_branch) { ok = false; problems.push(`branch "${branch}" ≠ "${target_branch}"`) }

      const tree = await workingTreeClean()
      checks.workingTree = { clean: tree.clean, detail: tree.clean ? '' : tree.detail }
      if (!tree.clean) { ok = false; problems.push('working tree dirty') }

      const sync = await localIsPushed(target_branch)
      checks.inSync = sync
      if (!sync.pushed) { ok = false; problems.push(`local ${target_branch} not pushed`) }

      if (!skip_env_leak_check) {
        const leak = await scanEnvLeaks(`origin/${target_branch}...HEAD`)
        checks.envLeak = leak
        if (!leak.ok) { ok = false; problems.push(`env leak: ${leak.summary}`) }
      } else {
        checks.envLeak = { skipped: true }
      }

      if (!skip_migration_check) {
        const drift = await checkMigrationDrift()
        checks.migrations = drift
        if (!drift.ok) { ok = false; problems.push(`migrations: ${drift.summary}`) }
      } else {
        checks.migrations = { skipped: true }
      }

      const version = await readLocalVersion()
      const tagName = deployTagName(target_branch === 'prod' ? 'prod' : target_branch === 'main' ? 'dev' : 'stg', version)
      const tagExists = await stgTagExists(tagName)
      checks.version = { local: version, deployTag: tagName, tagExists }
      if (tagExists) { ok = false; problems.push(`deploy tag ${tagName} already exists — bump version first`) }

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
        expected_version: z.string().regex(/^\d+\.\d+\.\d+$/).optional().describe('Explicit X.Y.Z to match. Defaults to local package.json.'),
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
          return jsonText({ ok: true, expected, remote: last.body, url: last.url })
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
}
