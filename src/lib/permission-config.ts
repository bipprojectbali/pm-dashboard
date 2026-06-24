// Permission rules — aturan role yang bisa dikonfigurasi runtime via AppSetting.
// Pola identik extensions.ts: cache 60s, invalidasi via setSetting hook.
// INVARIANT: SUPER_ADMIN bypass SELALU hardcode di route handler — BUKAN di sini.
// Ini mencegah admin mengunci diri sendiri.

import { getSettings } from './app-settings'

export type PermRuleType = 'systemRoles' | 'projectRoles' | 'minProjectRole'

export interface PermissionRuleMeta {
  key: string
  label: string
  description: string
  type: PermRuleType
  options: string[]
  default: string[]
}

export const PERMISSION_RULES: PermissionRuleMeta[] = [
  {
    key: 'permissions.project.create.allowedRoles',
    label: 'Project Create — System Roles',
    description:
      'Role sistem yang diizinkan membuat project baru. SUPER_ADMIN selalu bisa (tidak bisa diubah).',
    type: 'systemRoles',
    options: ['ADMIN', 'SUPER_ADMIN'],
    default: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'permissions.project.delete.allowedProjectRoles',
    label: 'Project Delete — Project Roles',
    description:
      'Role project yang diizinkan menghapus project. SUPER_ADMIN selalu bisa (tidak bisa diubah). Default: hanya OWNER.',
    type: 'projectRoles',
    options: ['OWNER', 'PM', 'MEMBER'],
    default: ['OWNER'],
  },
  {
    key: 'permissions.task.write.minProjectRole',
    label: 'Task Write — Minimal Project Role',
    description:
      'Role project minimal untuk membuat/mengubah task. Role di bawah level ini hanya bisa membaca.',
    type: 'minProjectRole',
    options: ['MEMBER', 'PM', 'OWNER'],
    default: ['MEMBER'],
  },
  {
    key: 'permissions.task.delete.allowedProjectRoles',
    label: 'Task Delete — Project Roles',
    description:
      'Role project yang diizinkan menghapus task milik orang lain. Reporter task selalu bisa hapus miliknya sendiri.',
    type: 'projectRoles',
    options: ['OWNER', 'PM', 'MEMBER'],
    default: ['OWNER', 'PM'],
  },
]

export const PERMISSION_RULE_KEYS = PERMISSION_RULES.map((r) => r.key)

const RULE_BY_KEY = new Map<string, PermissionRuleMeta>(PERMISSION_RULES.map((r) => [r.key, r]))

const CACHE_TTL_MS = 60_000
let _cache: { value: Record<string, string[]>; expiresAt: number } | null = null

async function loadAll(): Promise<Record<string, string[]>> {
  const map = await getSettings(PERMISSION_RULE_KEYS)
  return Object.fromEntries(
    PERMISSION_RULES.map((r) => {
      const raw = map[r.key]
      if (!raw) return [r.key, r.default]
      const parsed = parseAndValidateValue(r.key, raw)
      return [r.key, parsed.ok ? parsed.value : r.default]
    }),
  )
}

export async function getAllPermissionRules(): Promise<Record<string, string[]>> {
  const now = Date.now()
  if (_cache && _cache.expiresAt > now) return _cache.value
  const value = await loadAll()
  _cache = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}

export async function getPermissionRule(key: string): Promise<string[]> {
  const all = await getAllPermissionRules()
  const meta = RULE_BY_KEY.get(key)
  return all[key] ?? meta?.default ?? []
}

export function invalidatePermissionCache(): void {
  _cache = null
}

export function isValidPermissionKey(key: string): key is string {
  return RULE_BY_KEY.has(key)
}

export function parseAndValidateValue(
  key: string,
  rawJson: string,
): { ok: boolean; value: string[]; error?: string } {
  const meta = RULE_BY_KEY.get(key)
  if (!meta) return { ok: false, value: [], error: 'Unknown permission key' }
  let arr: unknown
  try {
    arr = JSON.parse(rawJson)
  } catch {
    return { ok: false, value: [], error: 'Value must be a JSON array' }
  }
  if (!Array.isArray(arr)) return { ok: false, value: [], error: 'Value must be an array' }
  if (arr.length === 0) return { ok: false, value: [], error: 'Value must not be empty' }
  const bad = arr.filter((v) => !meta.options.includes(String(v)))
  if (bad.length > 0)
    return { ok: false, value: [], error: `Invalid values: ${bad.join(', ')}. Allowed: ${meta.options.join(', ')}` }
  return { ok: true, value: arr.map(String) }
}

// ─── Project role ordering for minProjectRole comparison ──────────────────────
export const PROJECT_ROLE_ORDER: Record<string, number> = {
  VIEWER: 0,
  MEMBER: 1,
  PM: 2,
  OWNER: 3,
}

// Returns true if the given role meets the minimum project role requirement.
export function meetsMinProjectRole(role: string, minAllowed: string[]): boolean {
  const minLevel = Math.min(...minAllowed.map((r) => PROJECT_ROLE_ORDER[r] ?? 0))
  return (PROJECT_ROLE_ORDER[role] ?? -1) >= minLevel
}
