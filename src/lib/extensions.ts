// Extension toggle helper — fitur opsional yang bisa di-on/off runtime.
// Setting key di app_settings: `extensions.<name>.enabled` ('true' | 'false').
// Default semua aktif. Cache 60 detik di module-level; invalidate via setSetting hook.

import { getSetting, getSettings } from './app-settings'

export const EXTENSION_KEYS = ['github', 'chat'] as const
export type ExtensionKey = (typeof EXTENSION_KEYS)[number]

export interface ExtensionMeta {
  key: ExtensionKey
  label: string
  description: string
}

export const EXTENSION_META: Record<ExtensionKey, ExtensionMeta> = {
  github: {
    key: 'github',
    label: 'GitHub Integration',
    description:
      'Webhook /webhooks/github terima push/PR/review dan attribute ke proyek. Card aktivitas GitHub muncul di project detail. Dokumen github_project ikut di knowledge base Chat AI.',
  },
  chat: {
    key: 'chat',
    label: 'Chat AI',
    description:
      'Tab Chat AI di /admin (RAG + tool-calling). Sync chat_document otomatis (startup + cron 10m). Embedding API & Anthropic call hanya jalan saat aktif.',
  },
}

const CACHE_TTL_MS = 60_000
let _cache: { value: Record<ExtensionKey, boolean>; expiresAt: number } | null = null

function settingKey(name: ExtensionKey): string {
  return `extensions.${name}.enabled`
}

async function loadAll(): Promise<Record<ExtensionKey, boolean>> {
  const keys = EXTENSION_KEYS.map(settingKey)
  const map = await getSettings(keys)
  return Object.fromEntries(
    EXTENSION_KEYS.map((k) => [k, map[settingKey(k)] !== 'false']),
  ) as Record<ExtensionKey, boolean>
}

export async function getAllExtensions(): Promise<Record<ExtensionKey, boolean>> {
  const now = Date.now()
  if (_cache && _cache.expiresAt > now) return _cache.value
  const value = await loadAll()
  _cache = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}

export async function isExtensionEnabled(name: ExtensionKey): Promise<boolean> {
  const all = await getAllExtensions()
  return all[name]
}

// Cheap path-by-key for hot routes where we don't want to allocate the full map.
export async function isExtensionEnabledFresh(name: ExtensionKey): Promise<boolean> {
  const v = await getSetting(settingKey(name))
  return v !== 'false'
}

export function invalidateExtensionCache(): void {
  _cache = null
}

export function isValidExtensionKey(key: string): key is ExtensionKey {
  return (EXTENSION_KEYS as readonly string[]).includes(key)
}
