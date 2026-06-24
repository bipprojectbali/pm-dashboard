import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { checkMigrationDrift } from '../lib/guards'
import { PUBLISH_WORKFLOW, REPULL_WORKFLOW, REPO, STACK_NAME, errText, gh, jsonText, latestRun } from '../lib/utils'

export function registerSimpleTools(server: McpServer) {
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
        '--repo', REPO, '--ref', ref ?? stack_env,
        '-f', `stack_env=${stack_env}`, '-f', `tag=${tag}`,
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
        stack_name: z.string().default(STACK_NAME).describe('Portainer stack base name. Defaults to STACK_NAME from .env.'),
        stack_env: z.enum(['dev', 'stg', 'prod']).describe('Target env (suffix on stack name).'),
        ref: z.string().optional().describe('Override branch ref (default = stack_env).'),
      },
    },
    async ({ stack_name, stack_env, ref }) => {
      const dispatch = await gh([
        'workflow', 'run', REPULL_WORKFLOW,
        '--repo', REPO, '--ref', ref ?? stack_env,
        '-f', `stack_name=${stack_name}`, '-f', `stack_env=${stack_env}`,
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
      inputSchema: { run_id: z.string().describe('Numeric GitHub run id.') },
    },
    async ({ run_id }) => {
      const res = await gh([
        'run', 'view', run_id, '--repo', REPO,
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
        const res = await gh(['run', 'view', run_id, '--repo', REPO, '--json', 'status,conclusion'])
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
        'run', 'list', '--repo', REPO,
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
}
