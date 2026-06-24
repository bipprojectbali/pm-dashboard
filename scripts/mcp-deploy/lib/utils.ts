export const REPO = process.env.GH_DEPLOY_REPO ?? 'bipprojectbali/pm-dashboard'
export const PUBLISH_WORKFLOW = process.env.GH_PUBLISH_WORKFLOW ?? 'Publish Docker to GHCR'
export const REPULL_WORKFLOW = process.env.GH_REPULL_WORKFLOW ?? 'Re-Pull Docker'
export const PROJECT_ROOT = process.env.GH_DEPLOY_ROOT ?? process.cwd()
export const STG_BASE_URL = (process.env.STG_BASE_URL ?? 'https://pm-dashboard.wibudev.com').replace(/\/+$/, '')
export const STACK_NAME = process.env.STACK_NAME ?? 'pm-dashboard'

export async function gh(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(['gh', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { ok: code === 0, stdout, stderr, code }
}

export async function git(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(['git', ...args], { cwd: PROJECT_ROOT, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { ok: code === 0, stdout, stderr, code }
}

export async function readLocalVersion(): Promise<string> {
  const pkg = (await Bun.file(`${PROJECT_ROOT}/package.json`).json()) as { version: string }
  if (typeof pkg.version !== 'string') throw new Error('package.json has no string version')
  return pkg.version
}

export function deployTagName(env: 'dev' | 'stg' | 'prod', version: string): string {
  return `${env}-v${version}`
}

export async function stgTagExists(tagName: string): Promise<boolean> {
  const r = await git(['ls-remote', '--tags', 'origin', `refs/tags/${tagName}`])
  return r.ok && r.stdout.trim().length > 0
}

export async function currentBranch(): Promise<string> {
  const r = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return r.stdout.trim()
}

export async function workingTreeClean(): Promise<{ clean: boolean; detail: string }> {
  const r = await git(['status', '--porcelain'])
  return { clean: r.stdout.trim().length === 0, detail: r.stdout.trim() }
}

export async function localIsPushed(branch: string): Promise<{ pushed: boolean; local: string; remote: string }> {
  await git(['fetch', 'origin', branch])
  const local = (await git(['rev-parse', 'HEAD'])).stdout.trim()
  const remote = (await git(['rev-parse', `origin/${branch}`])).stdout.trim()
  return { pushed: local === remote, local, remote }
}

export async function pushDeployTag(tagName: string): Promise<{ ok: boolean; message: string }> {
  const create = await git(['tag', tagName])
  if (!create.ok && !create.stderr.includes('already exists')) {
    return { ok: false, message: `git tag failed: ${create.stderr}` }
  }
  const push = await git(['push', 'origin', tagName])
  return { ok: push.ok, message: push.stderr.trim() || push.stdout.trim() }
}

export function jsonText(data: unknown) {
  return {
    content: [
      { type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) },
    ],
  }
}

export function errText(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] }
}

export async function latestRun(workflow: string) {
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
