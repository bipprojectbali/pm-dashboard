import { describe, expect, test } from 'bun:test'
import {
  clearChatSession,
  deserializeChatSession,
  loadChatSession,
  saveChatSession,
  serializeChatSession,
} from '../../src/frontend/components/AdminChatPanel/chat-session-storage'
import type { ChatMessage } from '../../src/frontend/components/AdminChatPanel/types'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    size: () => map.size,
  }
}

const sampleMessages: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'halo' },
  {
    id: 'a1',
    role: 'assistant',
    content: 'jawaban',
    sources: [{ ref: '1', type: 'task', entityId: 't1', title: 'Task satu' }],
    toolCalls: [{ id: 'tc1', name: 'query_tasks', input: { mode: 'list' }, pending: false }],
  },
]

describe('chat-session-storage serialize/deserialize', () => {
  test('round-trips messages, systemContext, and contextLoadedAt as ISO string', () => {
    const loadedAt = new Date('2026-06-29T10:00:00.000Z')
    const raw = serializeChatSession({ messages: sampleMessages, systemContext: 'ctx', contextLoadedAt: loadedAt })
    expect(raw).toContain('2026-06-29T10:00:00.000Z')

    const back = deserializeChatSession(raw)
    expect(back).not.toBeNull()
    expect(back?.messages).toEqual(sampleMessages)
    expect(back?.systemContext).toBe('ctx')
    expect(back?.contextLoadedAt?.getTime()).toBe(loadedAt.getTime())
  })

  test('deserialize returns null for malformed JSON', () => {
    expect(deserializeChatSession('not json')).toBeNull()
  })

  test('deserialize tolerates a missing/invalid contextLoadedAt', () => {
    const back = deserializeChatSession(JSON.stringify({ messages: [], systemContext: null, contextLoadedAt: 'bogus' }))
    expect(back?.contextLoadedAt).toBeNull()
  })
})

describe('chat-session-storage save/load/clear', () => {
  test('save then load returns the same conversation', () => {
    const storage = fakeStorage()
    saveChatSession({ messages: sampleMessages, systemContext: 'ctx', contextLoadedAt: null }, storage)
    const back = loadChatSession(storage)
    expect(back?.messages).toEqual(sampleMessages)
    expect(back?.systemContext).toBe('ctx')
  })

  test('save with empty conversation removes the key instead of storing it', () => {
    const storage = fakeStorage()
    saveChatSession({ messages: sampleMessages, systemContext: 'ctx', contextLoadedAt: null }, storage)
    expect(storage.size()).toBe(1)
    saveChatSession({ messages: [], systemContext: null, contextLoadedAt: null }, storage)
    expect(storage.size()).toBe(0)
    expect(loadChatSession(storage)).toBeNull()
  })

  test('clearChatSession wipes a persisted session', () => {
    const storage = fakeStorage()
    saveChatSession({ messages: sampleMessages, systemContext: 'ctx', contextLoadedAt: null }, storage)
    clearChatSession(storage)
    expect(loadChatSession(storage)).toBeNull()
  })

  test('load returns null when storage is unavailable', () => {
    expect(loadChatSession(null)).toBeNull()
  })
})
