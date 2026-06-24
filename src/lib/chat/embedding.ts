import { getSetting } from '../app-settings'

const STOPWORDS_ID = new Set([
  'dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'adalah', 'ada', 'dengan',
  'ini', 'itu', 'atau', 'juga', 'sudah', 'belum', 'tidak', 'bisa', 'mana',
  'siapa', 'apa', 'berapa', 'bagaimana', 'kapan', 'apakah', 'tolong', 'mohon',
  'beri', 'tampilkan', 'tunjukkan', 'lihat', 'cari', 'semua', 'saya', 'kamu',
  'dia', 'kami', 'kita', 'mereka', 'tentang', 'pada', 'akan', 'dapat', 'perlu',
  'harus', 'sedang', 'telah', 'lagi', 'paling',
])

// Cosine similarity threshold: dokumen di bawah ini dianggap tidak relevan.
export const SEMANTIC_MIN_SIMILARITY = 0.35
// Kalau semantic search return < 3 doc relevan, merge dengan FTS fallback.
export const MIN_SEMANTIC_HITS = 3

export function extractKeywords(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS_ID.has(w))

  const capitalWords = text.split(/\s+/).filter((w) => w.length >= 2 && /^[A-Z]/.test(w))

  const unique = [...new Set([...words, ...capitalWords.map((w) => w.toLowerCase())])]
  return unique.join(' | ')
}

let _embeddingSettingsCache: { apiKey: string; baseUrl: string; model: string } | null | undefined

export function invalidateEmbeddingCache(): void {
  _embeddingSettingsCache = undefined
}

export async function getEmbeddingSettings(): Promise<{ apiKey: string; baseUrl: string; model: string } | null> {
  if (_embeddingSettingsCache !== undefined) return _embeddingSettingsCache
  const [apiKey, baseUrl, model] = await Promise.all([
    getSetting('embedding.apiKey'),
    getSetting('embedding.baseUrl'),
    getSetting('embedding.model'),
  ])
  const resolved = !apiKey
    ? null
    : {
        apiKey: apiKey as string,
        baseUrl: (baseUrl as string) || 'https://openrouter.ai/api/v1',
        model: (model as string) || 'openai/text-embedding-3-small',
      }
  _embeddingSettingsCache = resolved
  return resolved
}

export async function generateEmbedding(
  text: string,
  settings: { apiKey: string; baseUrl: string; model: string },
): Promise<number[] | null> {
  try {
    const endpoint = `${settings.baseUrl.replace(/\/$/, '')}/embeddings`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: settings.model, input: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    return data.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}
