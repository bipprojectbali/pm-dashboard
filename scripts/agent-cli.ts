#!/usr/bin/env bun
// Thin CLI over the token-scoped REST agent surface (/api/agent/*). Reads the
// pmt_ token from .env.agent (Bun does NOT auto-load that filename) and wraps the
// endpoints so an operator can inspect/update one project's tasks without curl.
//
//   bun run agent stats
//   bun run agent tasks --status CLOSED --page 2
//   bun run agent get <taskId>
//   bun run agent project
//   bun run agent guide
//   bun run agent create --title "Fix" --desc "500 on /login" --kind BUG --priority HIGH
//   bun run agent comment <taskId> "PR incoming"

type Flags = Record<string, string>

async function loadConfig(): Promise<{ token: string; base: string }> {
  const envAgent = Bun.file('.env.agent')
  const raw = (await envAgent.exists()) ? await envAgent.text() : ''
  const vars: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  const token = process.env.PM_API_TOKEN || vars.PM_API_TOKEN || ''
  if (!token) throw new Error('PM_API_TOKEN not found in .env.agent or environment')
  // Derive API base from PM_GUIDE_URL (strip the /api/agent/guide suffix) or PM_API_BASE.
  const guideUrl = process.env.PM_GUIDE_URL || vars.PM_GUIDE_URL || ''
  const base = process.env.PM_API_BASE || vars.PM_API_BASE || guideUrl.replace(/\/api\/agent\/guide\/?$/, '')
  if (!base) throw new Error('Cannot resolve API base — set PM_GUIDE_URL or PM_API_BASE in .env.agent')
  return { token, base: base.replace(/\/$/, '') }
}

function parseFlags(args: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else flags[key] = 'true'
    } else positional.push(a)
  }
  return { positional, flags }
}

async function call(
  cfg: { token: string; base: string },
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${cfg.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    /* keep raw text (e.g. the guide is text/plain) */
  }
  return { status: res.status, data }
}

function fail(msg: string): never {
  console.error(`error: ${msg}`)
  process.exit(1)
}

async function main() {
  const [command, ...rest] = Bun.argv.slice(2)
  if (!command || command === 'help') {
    console.log('commands: tasks | stats | get <id> | project | guide | create --title --desc [--kind --priority] | comment <id> <body>')
    return
  }
  const cfg = await loadConfig()
  const { positional, flags } = parseFlags(rest)

  if (command === 'tasks') {
    const q = new URLSearchParams()
    for (const k of ['status', 'kind', 'assigneeEmail', 'page', 'limit']) if (flags[k]) q.set(k, flags[k])
    const { status, data } = await call(cfg, 'GET', `/api/agent/tasks?${q}`)
    if (status !== 200) fail(JSON.stringify(data))
    const d = data as { total: number; page: number; totalPages: number; tasks: { id: string; status: string; priority: string; kind: string; title: string }[] }
    console.log(`page ${d.page}/${d.totalPages} — ${d.total} total`)
    for (const t of d.tasks) console.log(`  [${t.priority}] ${t.status.padEnd(12)} ${t.kind.padEnd(7)} ${t.title}  (${t.id})`)
    return
  }
  if (command === 'stats') {
    const { status, data } = await call(cfg, 'GET', '/api/agent/tasks/stats')
    if (status !== 200) fail(JSON.stringify(data))
    const d = data as { total: number; byStatus: Record<string, number>; byKind: Record<string, number> }
    console.log(`total: ${d.total}`)
    console.log('by status:', Object.entries(d.byStatus).filter(([k]) => k !== 'total').map(([k, v]) => `${k}=${v}`).join('  '))
    console.log('by kind:  ', Object.entries(d.byKind).map(([k, v]) => `${k}=${v}`).join('  '))
    return
  }
  if (command === 'get') {
    const id = positional[0] || fail('usage: get <taskId>')
    const { status, data } = await call(cfg, 'GET', `/api/agent/tasks/${id}`)
    if (status !== 200) fail(JSON.stringify(data))
    console.log(JSON.stringify(data, null, 2))
    return
  }
  if (command === 'project') {
    const { status, data } = await call(cfg, 'GET', '/api/agent/project')
    if (status !== 200) fail(JSON.stringify(data))
    console.log(JSON.stringify(data, null, 2))
    return
  }
  if (command === 'guide') {
    const { status, data } = await call(cfg, 'GET', '/api/agent/guide')
    if (status !== 200) fail(JSON.stringify(data))
    console.log(data)
    return
  }
  if (command === 'create') {
    if (!flags.title || !flags.desc) fail('usage: create --title <t> --desc <d> [--kind --priority]')
    const body: Record<string, unknown> = { title: flags.title, description: flags.desc }
    if (flags.kind) body.kind = flags.kind
    if (flags.priority) body.priority = flags.priority
    const { status, data } = await call(cfg, 'POST', '/api/agent/tasks', body)
    if (status !== 200) fail(JSON.stringify(data))
    console.log(`created ${(data as { task: { id: string } }).task.id}`)
    return
  }
  if (command === 'comment') {
    const id = positional[0]
    const text = positional.slice(1).join(' ')
    if (!id || !text) fail('usage: comment <taskId> <body>')
    const { status, data } = await call(cfg, 'POST', `/api/agent/tasks/${id}/comments`, { body: text })
    if (status !== 200) fail(JSON.stringify(data))
    console.log('comment added')
    return
  }
  fail(`unknown command: ${command}`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
