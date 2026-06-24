export async function sendToTelegram(botToken: string, chatId: string, text: string, timeoutMs = 30_000): Promise<void> {
  // Telegram Markdown mode: split if >4096 chars
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000))

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { description?: string }
      throw new Error(`Telegram error ${res.status}: ${err.description ?? 'unknown'}`)
    }
  }
}
