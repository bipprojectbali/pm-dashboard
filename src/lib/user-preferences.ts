// Single source of truth for per-user preferences (Settings → Preferensi).
// The HTTP endpoint (src/routes/me/preferences.route.ts) and the MCP tool
// (scripts/mcp/tools/preferences.ts) both delegate here so shape/defaults stay
// in sync. Stored in User.preferences (Json?).

export type PMTab = 'overview' | 'projects' | 'tasks' | 'activity' | 'team'
export type TaskDefaultFilter = 'mine' | 'all' | 'priority'

export type UserPreferences = {
  notifyTaskAssigned: boolean
  notifyTaskStatusChanged: boolean
  notifyMentioned: boolean
  notifyProjectDeadline: boolean
  pmDefaultTab: PMTab
  tasksDefaultFilter: TaskDefaultFilter
}

export function defaultPreferences(): UserPreferences {
  return {
    notifyTaskAssigned: true,
    notifyTaskStatusChanged: true,
    notifyMentioned: true,
    notifyProjectDeadline: true,
    pmDefaultTab: 'overview',
    tasksDefaultFilter: 'mine',
  }
}

const PM_TABS: PMTab[] = ['overview', 'projects', 'tasks', 'activity', 'team']
const TASK_FILTERS: TaskDefaultFilter[] = ['mine', 'all', 'priority']

// Maps a NotificationKind to the boolean preference that gates it. Kinds absent
// from this map are never gated (e.g. TASK_COMMENTED / TASK_DUE_SOON /
// TASK_OVERDUE always send). Keyed by the Prisma NotificationKind string.
const NOTIFICATION_PREF_KEY: Record<string, keyof UserPreferences> = {
  TASK_ASSIGNED: 'notifyTaskAssigned',
  TASK_STATUS_CHANGED: 'notifyTaskStatusChanged',
  TASK_MENTIONED: 'notifyMentioned',
}

// True when a kind is subject to a preference toggle (so the caller knows to
// look up recipient prefs before delivering).
export function isGatedKind(kind: string): boolean {
  return kind in NOTIFICATION_PREF_KEY
}

// Decide whether a notification of `kind` should be delivered to a recipient,
// given their raw stored preferences (User.preferences JSON, possibly null).
// Opt-out model: anything not explicitly disabled is delivered — so a recipient
// with no saved preferences (or an ungated kind) always receives it.
export function isNotificationAllowed(kind: string, rawPreferences: unknown): boolean {
  const prefKey = NOTIFICATION_PREF_KEY[kind]
  if (!prefKey) return true
  const prefs = sanitizePreferences((rawPreferences ?? {}) as Record<string, unknown>)
  return prefs[prefKey] !== false
}

// Coerce arbitrary input into a valid UserPreferences, falling back to defaults
// for any missing/invalid field. Unknown keys (e.g. the removed tableDensity)
// are dropped — only the fields above are ever returned.
export function sanitizePreferences(input: Record<string, unknown>): UserPreferences {
  const base = defaultPreferences()
  return {
    notifyTaskAssigned:
      typeof input.notifyTaskAssigned === 'boolean' ? input.notifyTaskAssigned : base.notifyTaskAssigned,
    notifyTaskStatusChanged:
      typeof input.notifyTaskStatusChanged === 'boolean' ? input.notifyTaskStatusChanged : base.notifyTaskStatusChanged,
    notifyMentioned: typeof input.notifyMentioned === 'boolean' ? input.notifyMentioned : base.notifyMentioned,
    notifyProjectDeadline:
      typeof input.notifyProjectDeadline === 'boolean' ? input.notifyProjectDeadline : base.notifyProjectDeadline,
    pmDefaultTab: PM_TABS.includes(input.pmDefaultTab as PMTab) ? (input.pmDefaultTab as PMTab) : base.pmDefaultTab,
    tasksDefaultFilter: TASK_FILTERS.includes(input.tasksDefaultFilter as TaskDefaultFilter)
      ? (input.tasksDefaultFilter as TaskDefaultFilter)
      : base.tasksDefaultFilter,
  }
}
