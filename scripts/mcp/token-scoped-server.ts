import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { prisma } from '../../src/lib/db'
import { tasksReadonly } from './tools/tasks'
import { registerChecklistTools } from './tools/tasks.checklist'
import { registerTaskWriteTools } from './tools/tasks.write'
import { errText } from './tools/shared'

// Context resolved from a `pmt_` project access token. Every tool registered on
// a token-scoped server is locked to this project + scope.
export interface TokenMcpContext {
  projectId: string
  scope: 'READ' | 'WRITE'
  tokenId: string
  userId: string | null
}

// Tool whitelist per scope (Tahap 2a). Deliberately excludes destructive/admin
// tools (task_delete, comment edit/delete, bulk, dependencies) and all ticket
// tools — those come in a later tahap. Keep this the single source of truth.
export const READ_TOOLS = ['task_list', 'task_get'] as const
export const WRITE_TOOLS = [
  ...READ_TOOLS,
  'task_create',
  'task_update',
  'task_transition',
  'task_comment',
  'task_checklist_add',
  'task_checklist_update',
  'task_checklist_delete',
] as const

// Tools whose inputSchema carries `projectId` — we strip it from the exposed
// schema and inject the token's projectId at call time.
const PROJECT_ID_TOOLS = new Set(['task_list', 'task_create'])
// Tools keyed by `taskId` — enforce the task belongs to the token's project.
const TASK_ID_TOOLS = new Set(['task_get', 'task_update', 'task_transition', 'task_comment', 'task_checklist_add'])
// Tools keyed by `itemId` (checklist item → task) — enforce ownership via the parent task.
const ITEM_ID_TOOLS = new Set(['task_checklist_update', 'task_checklist_delete'])
// Tools that mutate a task and must be blocked for IDEA-kind targets.
const MUTATING_TOOLS = new Set([
  'task_create',
  'task_update',
  'task_transition',
  'task_comment',
  'task_checklist_add',
  'task_checklist_update',
  'task_checklist_delete',
])

type ToolConfig = { inputSchema?: Record<string, unknown>; [k: string]: unknown }
type ToolCb = (args: Record<string, unknown>, extra: unknown) => unknown | Promise<unknown>
interface Harvested {
  config: ToolConfig
  cb: ToolCb
}

// Capture proxy: records registerTool calls instead of registering. The task
// register* functions only ever call `registerTool`, so a no-op Proxy fallback
// keeps this safe if they ever touch another method.
function harvestTools(): Map<string, Harvested> {
  const captured = new Map<string, Harvested>()
  const proxy = new Proxy(
    {
      registerTool(name: string, config: ToolConfig, cb: ToolCb) {
        captured.set(name, { config, cb })
      },
    },
    { get: (target, prop) => (prop in target ? (target as Record<string, unknown>)[prop as string] : () => {}) },
  ) as unknown as McpServer

  tasksReadonly.register(proxy)
  registerTaskWriteTools(proxy)
  registerChecklistTools(proxy)
  return captured
}

// Resolve the parent task's project + kind for an itemId (checklist item).
async function resolveItemTask(itemId: string): Promise<{ projectId: string; kind: string } | null> {
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    select: { task: { select: { projectId: true, kind: true } } },
  })
  return item?.task ?? null
}

async function resolveTask(taskId: string): Promise<{ projectId: string; kind: string } | null> {
  return prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true, kind: true } })
}

function wrapCallback(name: string, cb: ToolCb, ctx: TokenMcpContext): ToolCb {
  return async (args, extra) => {
    // 1. projectId-keyed: inject the token's project (overwrites any client value).
    if (PROJECT_ID_TOOLS.has(name)) {
      args.projectId = ctx.projectId
      // IDEA read-only: block creating an IDEA via token.
      if (name === 'task_create' && args.kind === 'IDEA') {
        return errText('IDEA is read-only via access token — promote to a task in the UI first.')
      }
      return cb(args, extra)
    }

    // 2. taskId/itemId-keyed: enforce the target task belongs to this project.
    let target: { projectId: string; kind: string } | null = null
    if (TASK_ID_TOOLS.has(name)) target = await resolveTask(String(args.taskId))
    else if (ITEM_ID_TOOLS.has(name)) target = await resolveItemTask(String(args.itemId))

    if (TASK_ID_TOOLS.has(name) || ITEM_ID_TOOLS.has(name)) {
      if (!target) return errText('Task not found')
      if (target.projectId !== ctx.projectId) return errText('Task not found') // do not leak cross-project existence
      // IDEA read-only: block any mutation targeting an IDEA task.
      if (MUTATING_TOOLS.has(name) && target.kind === 'IDEA') {
        return errText('IDEA is read-only via access token.')
      }
      // task_update must not convert a task INTO an IDEA via token.
      if (name === 'task_update' && args.kind === 'IDEA') {
        return errText('Cannot change kind to IDEA via access token.')
      }
    }
    return cb(args, extra)
  }
}

// Build a fresh McpServer exposing only the whitelisted tools for the token's
// scope, each locked to the token's project. Never reads NODE_ENV — WRITE is
// gated solely by ctx.scope, independent of the stdio server's prod cap.
export function buildTokenScopedServer(ctx: TokenMcpContext): McpServer {
  const harvested = harvestTools()
  const allowed: readonly string[] = ctx.scope === 'WRITE' ? WRITE_TOOLS : READ_TOOLS
  const server = new McpServer({ name: 'pm-dashboard-project', version: '1.0.0' })

  for (const name of allowed) {
    const tool = harvested.get(name)
    if (!tool) continue
    // Strip projectId from the exposed schema so the agent neither needs nor can set it.
    let inputSchema = tool.config.inputSchema
    if (PROJECT_ID_TOOLS.has(name) && inputSchema && 'projectId' in inputSchema) {
      const { projectId: _drop, ...rest } = inputSchema
      inputSchema = rest
    }
    server.registerTool(
      name,
      { ...tool.config, inputSchema } as Parameters<McpServer['registerTool']>[1],
      wrapCallback(name, tool.cb, ctx) as Parameters<McpServer['registerTool']>[2],
    )
  }
  return server
}
