import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const REPO = process.env.GH_DEPLOY_REPO ?? 'bipprojectbali/pm-dashboard'
const PUBLISH_WORKFLOW = process.env.GH_PUBLISH_WORKFLOW ?? 'Publish Docker to GHCR'
const REPULL_WORKFLOW = process.env.GH_REPULL_WORKFLOW ?? 'Re-Pull Docker'
const PROJECT_ROOT = process.env.GH_DEPLOY_ROOT ?? process.cwd()

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

async function pushDeployTag(tagName: string): Promise<{ ok: boolean; message: string }> {
  const create = await git(['tag', tagName])
  if (!create.ok && !create.stderr.includes('already exists')) {
    return { ok: false, message: `git tag failed: ${create.stderr}` }
  }
  const push = await git(['push', 'origin', tagName])
  return { ok: push.ok, message: push.stderr.trim() || push.stdout.trim() }
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

const server = new McpServer({ name: 'deploy', version: '0.1.0' })

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
    title: 'Full stg deploy (publish → wait → re-pull → wait)',
    description:
      'Runs Publish for stg using the version from local package.json, waits for success, triggers Re-Pull, and tags the commit stg-v<version> on origin. Rejects if the version was already deployed (unless force=true). Bump first with bump_version.',
    inputSchema: {
      stack_name: z.string().default('pm-dashboard').optional(),
      publish_timeout_seconds: z.number().int().min(60).max(1800).default(900).optional(),
      repull_timeout_seconds: z.number().int().min(60).max(1800).default(600).optional(),
      force: z.boolean().default(false).optional().describe('Skip version-already-deployed guard.'),
    },
  },
  async ({ stack_name = 'pm-dashboard', publish_timeout_seconds = 900, repull_timeout_seconds = 600, force = false }) => {
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

    const tagged = repullFinal.conclusion === 'success' ? await pushDeployTag(tagName) : { ok: false, message: 'skipped (re-pull did not succeed)' }

    return jsonText({
      stage: 'done',
      version,
      publish: { run_id: pubId, ...pubFinal },
      re_pull: { run_id: repullId, ...repullFinal },
      deploy_tag: { name: tagName, pushed: tagged.ok, message: tagged.message },
    })
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

await server.connect(new StdioServerTransport())
