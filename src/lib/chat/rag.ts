import { type DocHit, searchDocuments } from '../chat-documents'
import type { ChatSource } from './types'

export async function retrieveRelevantDocs(
  userMessage: string,
): Promise<{ text: string; count: number; sources: ChatSource[] }> {
  const result = await searchDocuments(userMessage, 6)
  if (!result.formatted) return { text: '', count: 0, sources: [] }
  const sources: ChatSource[] = result.hits.map((h: DocHit) => ({
    ref: h.ref,
    type: h.type,
    entityId: h.entityId,
    title: h.title,
  }))
  return {
    text: `═══ DOKUMEN RELEVAN DARI KNOWLEDGE BASE ═══\n${result.formatted}`,
    count: result.hits.length,
    sources,
  }
}
