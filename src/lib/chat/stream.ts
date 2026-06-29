import { CHAT_TOOLS, executeChatTool } from '../chat-tools'
import { isExtensionEnabled } from '../extensions'
import type { ChatStreamParams } from './types'

type SSEController = ReadableStreamDefaultController<Uint8Array>

const MAX_TOOL_ITERATIONS = 5

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

type AnthropicAssistantMessage = {
  role: 'assistant'
  content: AnthropicContentBlock[]
}

type AnthropicUserMessage = {
  role: 'user'
  content:
    | string
    | Array<{ type: 'text'; text: string } | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }>
}

type AnthropicMessage = AnthropicAssistantMessage | AnthropicUserMessage

export async function streamChatSSE(params: ChatStreamParams, ctrl: SSEController): Promise<void> {
  const { apiKey, model, baseUrl, timeoutMs = 120_000, systemContext, messages, relevantDocs, sources } = params

  const enc = new TextEncoder()
  const send = (event: string, data: object) => {
    try { ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { /* disconnected */ }
  }

  if (sources && sources.length > 0) send('sources', { sources })

  const endpoint = baseUrl ? `${baseUrl.replace(/\/$/, '')}/v1/messages` : 'https://api.anthropic.com/v1/messages'

  const conversation: AnthropicMessage[] = messages.map((m, idx) => {
    const isLast = idx === messages.length - 1
    if (isLast && m.role === 'user' && relevantDocs) {
      return { role: 'user', content: `${relevantDocs}\n\n---\n\nPertanyaan: ${m.content}` }
    }
    return m.role === 'user'
      ? { role: 'user', content: m.content }
      : { role: 'assistant', content: [{ type: 'text', text: m.content }] }
  })

  let full = ''
  const toolCallsTrace: Array<{ name: string; input: unknown; result: unknown }> = []

  // Auto-hide tool yang depend on extension yang OFF.
  const githubEnabled = await isExtensionEnabled('github')
  const availableTools = githubEnabled ? CHAT_TOOLS : CHAT_TOOLS.filter((t) => t.name !== 'query_github_activity')

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
    const isFinalIter = iter === MAX_TOOL_ITERATIONS - 1
    send('phase', {
      phase: 'thinking',
      iter,
      label: iter === 0 ? 'Menganalisis pertanyaan...' : 'Memproses data & menyusun jawaban...',
    })

    const body = {
      model: model ?? 'claude-opus-4-7',
      max_tokens: 2048,
      system: systemContext,
      messages: conversation,
      tools: isFinalIter ? undefined : availableTools,
    }

    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      send('error', { message: `Network error: ${e instanceof Error ? e.message : String(e)}` })
      return
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      send('error', { message: `Claude API error ${res.status}: ${err.error?.message ?? 'unknown'}` })
      return
    }

    const payload = (await res.json()) as { stop_reason: string; content: AnthropicContentBlock[] }
    conversation.push({ role: 'assistant', content: payload.content })

    for (const block of payload.content) {
      if (block.type === 'text' && block.text) { full += block.text; send('token', { text: block.text }) }
    }

    if (payload.stop_reason !== 'tool_use') break

    send('phase', { phase: 'tool', iter, label: 'Mencari data...' })

    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = []
    for (const block of payload.content) {
      if (block.type !== 'tool_use') continue
      send('tool_use', { id: block.id, name: block.name, input: block.input })
      const result = await executeChatTool(block.name, block.input)
      toolCallsTrace.push({ name: block.name, input: block.input, result })
      send('tool_result', { id: block.id, name: block.name, ok: result.ok, result })
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), is_error: !result.ok })
    }

    conversation.push({ role: 'user', content: toolResults })
  }

  send('done', { full, sources: sources ?? [], toolCalls: toolCallsTrace })
}
