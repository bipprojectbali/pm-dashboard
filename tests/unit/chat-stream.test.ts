import { afterEach, describe, expect, test } from 'bun:test'
import { streamChatSSE } from '../../src/lib/chat/stream'
import type { ChatStreamParams } from '../../src/lib/chat/types'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function collectSSE() {
  const dec = new TextDecoder()
  const frames: Array<{ event: string; data: Record<string, unknown> }> = []
  let buf = ''
  const ctrl = {
    enqueue: (bytes: Uint8Array) => {
      buf += dec.decode(bytes)
      const parts = buf.split('\n\n')
      buf = parts.pop() ?? ''
      for (const raw of parts) {
        const ev = raw.match(/^event: (.+)$/m)?.[1]
        const dt = raw.match(/^data: (.+)$/m)?.[1]
        if (ev && dt) frames.push({ event: ev, data: JSON.parse(dt) })
      }
    },
  } as unknown as ReadableStreamDefaultController<Uint8Array>
  return { ctrl, frames }
}

function baseParams(): ChatStreamParams {
  return {
    apiKey: 'test-key',
    model: 'claude-test',
    systemContext: 'system',
    messages: [{ role: 'user', content: 'halo' }],
  }
}

describe('streamChatSSE phase events', () => {
  test('emits a phase event with a non-empty human-readable label', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'jawaban' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    const { ctrl, frames } = collectSSE()
    await streamChatSSE(baseParams(), ctrl)

    const phases = frames.filter((f) => f.event === 'phase')
    expect(phases.length).toBeGreaterThan(0)
    for (const p of phases) {
      expect(typeof p.data.label).toBe('string')
      expect((p.data.label as string).length).toBeGreaterThan(0)
    }
  })

  test('still streams the answer token after the phase event', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'jawaban' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    const { ctrl, frames } = collectSSE()
    await streamChatSSE(baseParams(), ctrl)

    const token = frames.find((f) => f.event === 'token')
    expect(token?.data.text).toBe('jawaban')
    const done = frames.find((f) => f.event === 'done')
    expect(done?.data.full).toBe('jawaban')
  })
})
