export const MAX_ROWS = 50
export const MAX_WINDOW_DAYS = 90

export interface AnthropicTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ToolResult {
  ok: boolean
  error?: string
  rows?: unknown[]
  summary?: Record<string, unknown>
  truncated?: boolean
}
