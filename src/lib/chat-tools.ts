import { z } from 'zod'
import { QueryGithubInput, runQueryGithub } from './chat-tools/github'
import { QueryProjectDetailInput, runQueryProjectDetail } from './chat-tools/projects'
import { QueryTasksInput, runQueryTasks } from './chat-tools/tasks'
import { QueryUsersInput, runQueryUsers } from './chat-tools/users'

export type { AnthropicTool, ToolResult } from './chat-tools/types'
export { CHAT_TOOLS } from './chat-tools/schemas'

export async function executeChatTool(name: string, rawInput: unknown) {
  try {
    switch (name) {
      case 'query_users':
        return await runQueryUsers(QueryUsersInput.parse(rawInput))
      case 'query_tasks':
        return await runQueryTasks(QueryTasksInput.parse(rawInput))
      case 'query_project_detail':
        return await runQueryProjectDetail(QueryProjectDetailInput.parse(rawInput))
      case 'query_github_activity':
        return await runQueryGithub(QueryGithubInput.parse(rawInput))
      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return {
        ok: false,
        error: `Invalid input: ${e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      }
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
