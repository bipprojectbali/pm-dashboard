export async function callClaudeAPI(
  apiKey: string,
  model: string,
  prompt: string,
  baseUrl?: string,
  timeoutMs?: number,
): Promise<string> {
  const endpoint = baseUrl ? `${baseUrl.replace(/\/$/, '')}/v1/messages` : 'https://api.anthropic.com/v1/messages'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs ?? 120_000),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(`Claude API error ${res.status}: ${err.error?.message ?? 'unknown'}`)
  }
  const data = (await res.json()) as { content: Array<{ type: string; text: string }> }
  const text = data.content.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Claude API returned no text content')
  return text
}
