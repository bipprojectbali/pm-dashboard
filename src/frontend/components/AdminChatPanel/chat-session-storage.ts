import type { ChatMessage } from './types'

const STORAGE_KEY = 'admin:chat:session'

export type ChatSessionState = {
  messages: ChatMessage[]
  systemContext: string | null
  contextLoadedAt: Date | null
}

type PersistedShape = {
  messages: ChatMessage[]
  systemContext: string | null
  contextLoadedAt: string | null
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

export function serializeChatSession(state: ChatSessionState): string {
  const shape: PersistedShape = {
    messages: state.messages,
    systemContext: state.systemContext,
    contextLoadedAt: state.contextLoadedAt ? state.contextLoadedAt.toISOString() : null,
  }
  return JSON.stringify(shape)
}

export function deserializeChatSession(raw: string): ChatSessionState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>
    if (!Array.isArray(parsed.messages)) return null
    const loadedAt = parsed.contextLoadedAt ? new Date(parsed.contextLoadedAt) : null
    return {
      messages: parsed.messages,
      systemContext: parsed.systemContext ?? null,
      contextLoadedAt: loadedAt && !Number.isNaN(loadedAt.getTime()) ? loadedAt : null,
    }
  } catch {
    return null
  }
}

export function loadChatSession(storage: StorageLike | null = defaultStorage()): ChatSessionState | null {
  if (!storage) return null
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return null
  return deserializeChatSession(raw)
}

export function saveChatSession(state: ChatSessionState, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  if (state.messages.length === 0 && state.systemContext === null) {
    storage.removeItem(STORAGE_KEY)
    return
  }
  try {
    storage.setItem(STORAGE_KEY, serializeChatSession(state))
  } catch {
    /* quota or serialization failure — non-fatal */
  }
}

export function clearChatSession(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  storage.removeItem(STORAGE_KEY)
}
