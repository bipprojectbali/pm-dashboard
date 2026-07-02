import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTaskCommentTools } from './tasks.write.comments'
import { registerTaskWriteCoreTools } from './tasks.write.core'
import { registerTaskEvidenceTools } from './tasks.write.evidence'

// Barrel for the task write tools. Registration order is preserved
// (core → comments → evidence) because token-scoped-server.ts harvests these
// via a capture-proxy and relies on the same tool sequence.
export function registerTaskWriteTools(server: McpServer) {
  registerTaskWriteCoreTools(server)
  registerTaskCommentTools(server)
  registerTaskEvidenceTools(server)
}
