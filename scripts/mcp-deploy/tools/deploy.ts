import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { type EnvLeakHit, checkMigrationDrift, fetchStgVersion, scanEnvLeaks } from '../lib/guards'
import {
  PUBLISH_WORKFLOW,
  REPULL_WORKFLOW,
  REPO,
  STACK_NAME,
  currentBranch,
  deployTagName,
  errText,
  gh,
  jsonText,
  latestRun,
  localIsPushed,
  pushDeployTag,
  readLocalVersion,
  stgTagExists,
  workingTreeClean,
} from '../lib/utils'

function formatLeakError(summary: string, newDotEnv: string[], hits: EnvLeakHit[], bypass: string): string {
  const lines: string[] = [`env-leak scan blocked deploy — ${summary}`]
  if (newDotEnv.length) lines.push(`\nNew .env files added:\n  - ${newDotEnv.join('\n  - ')}`)
  if (hits.length) {
    lines.push('\nCredential-pattern matches:')
    for (const h of hits.slice(0, 20)) lines.push(`  - ${h.file}:${h.line} [${h.pattern}] ${h.preview}`)
    if (hits.length > 20) lines.push(`  … ${hits.length - 20} more`)
  }
  lines.push(bypass)
  return lines.join('\n')
}

async function pollRun(
  runId: string,
  timeoutMs: number,
  pollMs: number,
): Promise<Record<string, unknown>> {
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

export function registerDeployTool(server: McpServer) {
  server.registerTool(
    'deploy_stg',
    {
      title: 'Full stg deploy (preflight → publish → re-pull → verify)',
      description:
        'End-to-end stg deploy guarded by preflight checks. Flow: env-leak scan + branch/clean/sync/migration-drift/version-tag guards → dispatch Publish workflow (tag = package.json version) → wait → dispatch Re-Pull workflow → wait → verify stg /api/version reports the new version → push stg-v<version> git tag on origin. Rejects if version was already deployed (unless force=true). Bump first with bump_version.',
      inputSchema: {
        stack_name: z.string().default(STACK_NAME).optional().describe('Portainer stack base name. Defaults to STACK_NAME from .env.'),
        publish_timeout_seconds: z.number().int().min(60).max(1800).default(900).optional(),
        repull_timeout_seconds: z.number().int().min(60).max(1800).default(600).optional(),
        verify_timeout_seconds: z.number().int().min(10).max(600).default(180).optional(),
        force: z.boolean().default(false).optional().describe('Skip version-already-deployed guard.'),
        skip_migration_check: z.boolean().default(false).optional().describe('Skip the prisma schema↔migrations drift guard (emergency only).'),
        skip_env_leak_check: z.boolean().default(false).optional().describe('Skip the env/credential leak scan against origin/stg (emergency only).'),
        skip_verify: z.boolean().default(false).optional().describe('Skip the post-deploy /api/version check (e.g. if stg is unreachable from dev machine).'),
      },
    },
    async ({
      stack_name = STACK_NAME,
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
      if (!tree.clean) return errText(`working tree not clean — commit or stash before deploying:\n${tree.detail}`)

      const sync = await localIsPushed('stg')
      if (!sync.pushed) {
        return errText(`local stg is not in sync with origin/stg — push first.\n  local:  ${sync.local}\n  remote: ${sync.remote}`)
      }

      if (!skip_env_leak_check) {
        const leak = await scanEnvLeaks('origin/stg...HEAD')
        if (!leak.ok) {
          return errText(formatLeakError(
            leak.summary, leak.newDotEnv, leak.hits,
            '\nIf these are false positives (e.g. test fixtures), add them to ENV_LEAK_ALLOWLIST in scripts/mcp-deploy/lib/guards.ts. Pass skip_env_leak_check: true to bypass (emergency only).',
          ))
        }
      }

      if (!skip_migration_check) {
        const drift = await checkMigrationDrift()
        if (!drift.ok) {
          return errText(`migration drift blocked deploy — ${drift.summary}\n\n${drift.detail}\n\nPass skip_migration_check: true to bypass (emergency only — the migrate sidecar will not catch up automatically).`)
        }
      }

      const version = await readLocalVersion()
      const tagName = deployTagName('stg', version)
      if (!force && (await stgTagExists(tagName))) {
        return errText(`version ${version} was already deployed to stg (git tag ${tagName} exists on origin). Bump first: bump_version({ level: "patch" | "minor" | "major" }), then deploy again. Or pass force: true to redeploy the same version.`)
      }

      const pubDispatch = await gh([
        'workflow', 'run', PUBLISH_WORKFLOW,
        '--repo', REPO, '--ref', 'stg',
        '-f', 'stack_env=stg', '-f', `tag=${version}`,
      ])
      if (!pubDispatch.ok) return errText(`publish dispatch failed: ${pubDispatch.stderr || pubDispatch.stdout}`)
      await Bun.sleep(3000)
      const pubRun = await latestRun(PUBLISH_WORKFLOW)
      if (!pubRun) return errText('could not find publish run after dispatch')

      const pubId = String(pubRun.databaseId)
      const pubFinal = await pollRun(pubId, publish_timeout_seconds * 1000, 20000)
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
      const repullFinal = await pollRun(repullId, repull_timeout_seconds * 1000, 10000)

      let verify: { ok: boolean; skipped?: boolean; expected: string; remote?: unknown; url?: string; lastResponse?: unknown; timedOut?: boolean; hint?: string } =
        { ok: false, skipped: true, expected: version }

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
            ok: false, expected: version, lastResponse: last ?? undefined, timedOut: true,
            hint: last?.body?.version && last.body.version !== version
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
        : { ok: false, message: repullFinal.conclusion !== 'success' ? 'skipped (re-pull did not succeed)' : 'skipped (verify_stg did not confirm new version)' }

      return jsonText({
        stage: 'done', version,
        publish: { run_id: pubId, ...pubFinal },
        re_pull: { run_id: repullId, ...repullFinal },
        verify,
        deploy_tag: { name: tagName, pushed: tagged.ok, message: tagged.message },
      })
    },
  )
}
