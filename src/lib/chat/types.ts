export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSource {
  ref: string
  type: string
  entityId: string
  title: string
}

export interface ChatStreamParams {
  apiKey: string
  model: string
  baseUrl?: string
  timeoutMs?: number
  systemContext: string
  messages: ChatMessage[]
  relevantDocs?: string
  sources?: ChatSource[]
}
