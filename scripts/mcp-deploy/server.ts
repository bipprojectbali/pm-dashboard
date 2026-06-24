import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerBumpPreflightTools } from './tools/bump-preflight'
import { registerDeployTool } from './tools/deploy'
import { registerReleaseTool } from './tools/release'
import { registerSimpleTools } from './tools/simple'

if (!process.env.GH_TOKEN) {
  console.error(
    '[deploy-stg] warning: GH_TOKEN is not set — gh CLI will fall back to the user keyring or fail. Set GH_TOKEN in .env for non-interactive use.',
  )
}

const server = new McpServer({ name: 'deploy-stg', version: '0.2.0' })

registerSimpleTools(server)
registerBumpPreflightTools(server)
registerDeployTool(server)
registerReleaseTool(server)

await server.connect(new StdioServerTransport())
