import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { type EnvLeakHit, checkMigrationDrift, fetchStgVersion, scanEnvLeaks } from '../lib/guards'
import {
  PROJECT_ROOT,
  PUBLISH_WORKFLOW,
  REPULL_WORKFLOW,
  REPO,
  STACK_NAME,
  currentBranch,
  deployTagName,
  errText,
  gh,
  git,
  jsonText,
  latestRun,
  localIsPushed,
  pushDeployTag,
  readLocalVersion,
  stgTagExists,
  workingTreeClean,
} from '../lib/utils'

function formatLeakError(summary: string, newDotEnv: string[], hits: EnvLeakHit[], bypass: string): string {
  const lines: string[] = [`env-leak scan blocked release — ${summary}`]
  if (newDotEnv.length) lines.push(`\nNew .env files added:\n  - ${newDotEnv.join('\n  - ')}`)
  if (hits.length) {
    lines.push('\nCredential-pattern matches:')
    for (const h of hits.slice(0, 20)) lines.push(`  - ${h.file}:${h.line} [${h.pattern}] ${h.preview}`)
    if (hits.length > 20) lines.push(`  … ${hits.length - 20} more`)
  }
  lines.push(bypass)
  return lines.join('\n')
}

async function pollRun(runId: string, timeoutMs: number, pollMs: number): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs
  let final: Record<string, unknown> = {}
  while (Date.now() < deadline) {
    const r = await gh(['run', 'view', runId, '--repo', REPO, '--json', 'status,conclusion,url'])
    if (!r.ok) break
    final = JSON.parse(r.stdout)
    if (final.status !== 'in_progress' && final.status !== 'queued') break
    await Bun.sleep(pollMs)
  }
  return final
}

export function registerReleaseTool(server: McpServer) {
  server.registerTool(
    'release_stg',
    {
      title: 'One-shot release to stg (preflight → bump → commit/push → publish → re-pull → verify → tag)',
      description:
        'End-to-end release: bumps package.json (patch/minor/major or explicit), commits "chore(release): vX.Y.Z", pushes, then runs the same flow as deploy_stg (publish → re-pull → verify → push deploy tag). Stops on first guard failure; if bump+push succeed but a later phase fails, the release commit is already on origin — fix the issue and run deploy_stg to finish (do NOT call release_stg again or it will bump again). Use skip_bump=true to redeploy current version. Use dry_run=true to preview without mutating anything.',
      inputSchema: {
        level: z.enum(['patch', 'minor', 'major']).default('patch').optional(),
        version: z.string().regex(/^\d+\.\d+\.\d+$/).optional().describe('Explicit X.Y.Z. Overrides level when set.'),
        skip_bump: z.boolean().default(false).optional().describe('Reuse current package.json version (skip the bump+commit+push). Refuses if stg-v<version> already exists on origin unless force=true.'),
        force: z.boolean().default(false).optional().describe('When skip_bump=true, allow redeploying a version whose deploy tag already exists.'),
        dry_run: z.boolean().default(false).optional(),
        stack_name: z.string().default(STACK_NAME).optional().describe('Portainer stack base name. Defaults to STACK_NAME from .env.'),
        publish_timeout_seconds: z.number().int().min(60).max(1800).default(900).optional(),
        repull_timeout_seconds: z.number().int().min(60).max(1800).default(600).optional(),
        verify_timeout_seconds: z.number().int().min(10).max(600).default(180).optional(),
        skip_migration_check: z.boolean().default(false).optional(),
        skip_env_leak_check: z.boolean().default(false).optional(),
        skip_verify: z.boolean().default(false).optional(),
      },
    },
    async ({
      level = 'patch',
      version,
      skip_bump = false,
      force = false,
      dry_run = false,
      stack_name = STACK_NAME,
      publish_timeout_seconds = 900,
      repull_timeout_seconds = 600,
      verify_timeout_seconds = 180,
      skip_migration_check = false,
      skip_env_leak_check = false,
      skip_verify = false,
    }) => {
      const phases: Record<string, unknown> = {}

      const branch = await currentBranch()
      phases.branch = { current: branch, expected: 'stg', ok: branch === 'stg' }
      if (branch !== 'stg') return errText(`must be on branch "stg" (current: "${branch}")`)

      const tree = await workingTreeClean()
      phases.workingTree = { clean: tree.clean, detail: tree.clean ? '' : tree.detail }
      if (!tree.clean) return errText(`working tree not clean — commit or stash before releasing:\n${tree.detail}`)

      const sync = await localIsPushed('stg')
      phases.inSync = sync
      if (!sync.pushed) {
        return errText(`local stg is not in sync with origin/stg — push first.\n  local:  ${sync.local}\n  remote: ${sync.remote}`)
      }

      if (!skip_env_leak_check) {
        const leak = await scanEnvLeaks('origin/stg...HEAD')
        phases.envLeak = leak
        if (!leak.ok) {
          return errText(formatLeakError(
            leak.summary, leak.newDotEnv, leak.hits,
            '\nPass skip_env_leak_check: true to bypass (emergency only).',
          ))
        }
      } else {
        phases.envLeak = { skipped: true }
      }

      if (!skip_migration_check) {
        const drift = await checkMigrationDrift()
        phases.migrations = drift
        if (!drift.ok) {
          return errText(`migration drift blocked release — ${drift.summary}\n\n${drift.detail}\n\nRun \`bun run db:migrate --name <desc>\` locally, commit, then retry. Pass skip_migration_check: true to bypass (emergency only).`)
        }
      } else {
        phases.migrations = { skipped: true }
      }

      const prevVersion = await readLocalVersion()
      let nextVersion: string
      if (skip_bump) {
        nextVersion = prevVersion
      } else if (version) {
        nextVersion = version
      } else {
        const [maj, min, pat] = prevVersion.split('.').map((n) => Number.parseInt(n, 10))
        if ([maj, min, pat].some((n) => Number.isNaN(n))) return errText(`cannot parse current version "${prevVersion}"`)
        if (level === 'major') nextVersion = `${maj + 1}.0.0`
        else if (level === 'minor') nextVersion = `${maj}.${min + 1}.0`
        else nextVersion = `${maj}.${min}.${pat + 1}`
      }
      if (!skip_bump && nextVersion === prevVersion) {
        return errText(`computed next version equals current (${prevVersion}) — choose a different level/version or pass skip_bump=true`)
      }

      const tagName = deployTagName('stg', nextVersion)
      const tagAlreadyExists = await stgTagExists(tagName)
      phases.versionPlan = { previous: prevVersion, next: nextVersion, deployTag: tagName, tagAlreadyExists }
      if (tagAlreadyExists && !(skip_bump && force)) {
        return errText(
          skip_bump
            ? `version ${nextVersion} was already deployed (git tag ${tagName} exists on origin). Pass force: true to redeploy the same version.`
            : `next version ${nextVersion} would collide with existing deploy tag ${tagName}. Choose a higher level or version.`,
        )
      }

      if (dry_run) {
        return jsonText({ stage: 'dry_run', wouldRelease: nextVersion, deployTag: tagName, phases })
      }

      let bumpInfo: Record<string, unknown> = { skipped: skip_bump, previous: prevVersion, next: nextVersion }
      if (!skip_bump) {
        const pkgPath = `${PROJECT_ROOT}/package.json`
        const pkg = (await Bun.file(pkgPath).json()) as { version: string; [k: string]: unknown }
        pkg.version = nextVersion
        await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

        const add = await git(['add', 'package.json'])
        if (!add.ok) return errText(`git add failed: ${add.stderr}`)
        const commit = await git(['commit', '-m', `chore(release): v${nextVersion}`])
        if (!commit.ok) return errText(`git commit failed: ${commit.stderr || commit.stdout}`)
        const push = await git(['push', 'origin', `HEAD:stg`])
        if (!push.ok) {
          return errText(
            `git push failed: ${push.stderr || push.stdout}\n\nNote: bump commit v${nextVersion} is already on origin/stg. Run deploy_stg manually after fixing the underlying issue.`,
          )
        }
        bumpInfo = { skipped: false, previous: prevVersion, next: nextVersion, committed: true, pushed: true }
      }
      phases.bump = bumpInfo

      const pubDispatch = await gh([
        'workflow', 'run', PUBLISH_WORKFLOW,
        '--repo', REPO, '--ref', 'stg',
        '-f', 'stack_env=stg', '-f', `tag=${nextVersion}`,
      ])
      if (!pubDispatch.ok) {
        return errText(
          `publish dispatch failed: ${pubDispatch.stderr || pubDispatch.stdout}\n\n` +
            (skip_bump ? '' : `Note: bump commit v${nextVersion} is already on origin/stg. Run deploy_stg manually after fixing the underlying issue.`),
        )
      }
      await Bun.sleep(3000)
      const pubRun = await latestRun(PUBLISH_WORKFLOW)
      if (!pubRun) return errText('could not find publish run after dispatch')

      const pubId = String(pubRun.databaseId)
      const pubFinal = await pollRun(pubId, publish_timeout_seconds * 1000, 20000)
      phases.publish = { run_id: pubId, ...pubFinal }
      if (pubFinal.conclusion !== 'success') {
        return jsonText({ stage: 'publish_failed', version: nextVersion, phases, aborted: true })
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
      const repullFinal = await pollRun(repullId, repull_timeout_seconds * 1000, 10000)
      phases.re_pull = { run_id: repullId, ...repullFinal }

      let verify: { ok: boolean; skipped?: boolean; expected: string; remote?: unknown; url?: string; lastResponse?: unknown; timedOut?: boolean; hint?: string } =
        { ok: false, skipped: true, expected: nextVersion }

      if (repullFinal.conclusion === 'success' && !skip_verify) {
        const verifyDeadline = Date.now() + verify_timeout_seconds * 1000
        let last: Awaited<ReturnType<typeof fetchStgVersion>> | null = null
        while (Date.now() < verifyDeadline) {
          last = await fetchStgVersion()
          if (last.ok && last.body?.version === nextVersion) {
            verify = { ok: true, expected: nextVersion, remote: last.body, url: last.url }
            break
          }
          await Bun.sleep(10_000)
        }
        if (!verify.ok) {
          verify = {
            ok: false, expected: nextVersion, lastResponse: last ?? undefined, timedOut: true,
            hint: last?.body?.version && last.body.version !== nextVersion
              ? `stg still reporting v${last.body.version} — image rollout may be slow or the new image failed to start`
              : 'stg /api/version unreachable or not returning JSON',
          }
        }
      } else if (skip_verify) {
        verify = { ok: true, skipped: true, expected: nextVersion }
      }
      phases.verify = verify

      const canTag = repullFinal.conclusion === 'success' && (skip_verify || verify.ok)
      const tagged = canTag
        ? await pushDeployTag(tagName)
        : { ok: false, message: repullFinal.conclusion !== 'success' ? 'skipped (re-pull did not succeed)' : 'skipped (verify did not confirm new version)' }
      phases.deploy_tag = { name: tagName, pushed: tagged.ok, message: tagged.message }

      return jsonText({ stage: 'done', version: nextVersion, phases })
    },
  )
}
