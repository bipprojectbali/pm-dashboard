// Display metadata (color + human label) for every audit action the backend
// writes. Source of truth for both the action-filter dropdown (AuditFilters)
// and the row badge (AuditLogsTable). Keep in sync with the `writeAuditLog` /
// `audit()` call sites across src/ — an action missing here still renders, but
// falls back to a gray badge with its raw UPPER_SNAKE code and can't be filtered.
//
// Color convention: created→blue, updated→cyan, deleted/removed→red,
// auth-success→green, auth-fail→orange, restore/unblock→teal, role→violet,
// membership→grape, agent-origin→indigo.

export const actionBadge: Record<string, { color: string; label: string }> = {
  // Auth & session
  LOGIN: { color: 'green', label: 'Login' },
  LOGOUT: { color: 'gray', label: 'Logout' },
  LOGIN_FAILED: { color: 'orange', label: 'Login Failed' },
  LOGIN_BLOCKED: { color: 'red', label: 'Login Blocked' },
  LOGIN_THROTTLED: { color: 'orange', label: 'Login Throttled' },
  SESSIONS_REVOKED: { color: 'red', label: 'Sessions Revoked' },
  PASSWORD_CREATED: { color: 'teal', label: 'Password Created' },
  PASSWORD_CHANGED: { color: 'teal', label: 'Password Changed' },
  PROFILE_UPDATED: { color: 'cyan', label: 'Profile Updated' },

  // User management
  ROLE_CHANGED: { color: 'violet', label: 'Role Changed' },
  BLOCKED: { color: 'red', label: 'Blocked' },
  UNBLOCKED: { color: 'teal', label: 'Unblocked' },

  // Projects
  PROJECT_CREATED: { color: 'blue', label: 'Project Created' },
  PROJECT_UPDATED: { color: 'cyan', label: 'Project Updated' },
  PROJECT_DELETED: { color: 'red', label: 'Project Deleted' },
  PROJECT_EXTENDED: { color: 'cyan', label: 'Project Extended' },
  PROJECT_MEMBER_ADDED: { color: 'grape', label: 'Member Added' },
  PROJECT_MEMBER_REMOVED: { color: 'red', label: 'Member Removed' },
  PROJECT_MEMBER_ROLE_CHANGED: { color: 'grape', label: 'Member Role Changed' },

  // Tasks
  TASK_CREATED: { color: 'blue', label: 'Task Created' },
  TASK_UPDATED: { color: 'cyan', label: 'Task Updated' },
  TASK_DELETED: { color: 'red', label: 'Task Deleted' },
  TASK_BULK_CREATED: { color: 'blue', label: 'Task Bulk Created' },
  TASK_PURGED: { color: 'red', label: 'Task Purged' },
  TASK_RESTORED: { color: 'teal', label: 'Task Restored' },

  // Phases
  PHASE_CREATED: { color: 'blue', label: 'Phase Created' },
  PHASE_UPDATED: { color: 'cyan', label: 'Phase Updated' },
  PHASE_DELETED: { color: 'red', label: 'Phase Deleted' },

  // Milestones
  MILESTONE_CREATED: { color: 'blue', label: 'Milestone Created' },
  MILESTONE_UPDATED: { color: 'cyan', label: 'Milestone Updated' },
  MILESTONE_DELETED: { color: 'red', label: 'Milestone Deleted' },

  // Tags
  TAG_CREATED: { color: 'blue', label: 'Tag Created' },
  TAG_DELETED: { color: 'red', label: 'Tag Deleted' },

  // Evidence
  EVIDENCE_UPLOADED: { color: 'indigo', label: 'Evidence Uploaded' },
  EVIDENCE_DELETED: { color: 'red', label: 'Evidence Deleted' },

  // QC tickets
  QC_TICKET_CREATED: { color: 'blue', label: 'QC Ticket Created' },
  QC_TICKET_UPDATED: { color: 'cyan', label: 'QC Ticket Updated' },
  QC_TICKET_DELETED: { color: 'red', label: 'QC Ticket Deleted' },
  QC_TICKET_BULK_UPDATED: { color: 'cyan', label: 'QC Ticket Bulk Updated' },
  QC_TICKET_REVISION_REQUESTED: { color: 'orange', label: 'QC Revision Requested' },
  QC_COMMENT_EDITED: { color: 'gray', label: 'QC Comment Edited' },
  QC_COMMENT_DELETED: { color: 'red', label: 'QC Comment Deleted' },

  // Access tokens
  ACCESS_TOKEN_CREATED: { color: 'blue', label: 'Access Token Created' },
  ACCESS_TOKEN_REVOKED: { color: 'orange', label: 'Access Token Revoked' },
  ACCESS_TOKEN_DELETED: { color: 'red', label: 'Access Token Deleted' },

  // Agent-originated (token-scoped coding agents)
  AGENT_TASK_CREATED: { color: 'indigo', label: 'Agent · Task Created' },
  AGENT_TASK_UPDATED: { color: 'indigo', label: 'Agent · Task Updated' },
  AGENT_TASK_DELETED: { color: 'indigo', label: 'Agent · Task Deleted' },
  AGENT_TASK_CLAIMED: { color: 'indigo', label: 'Agent · Task Claimed' },
  AGENT_TASK_COMMENTED: { color: 'indigo', label: 'Agent · Task Commented' },
  AGENT_EVIDENCE_ADDED: { color: 'indigo', label: 'Agent · Evidence Added' },
  AGENT_CHECKLIST_ADDED: { color: 'indigo', label: 'Agent · Checklist Added' },
  AGENT_CHECKLIST_UPDATED: { color: 'indigo', label: 'Agent · Checklist Updated' },
  AGENT_CHECKLIST_DELETED: { color: 'indigo', label: 'Agent · Checklist Deleted' },

  // Admin / system
  SELF_PROJECT_SET: { color: 'grape', label: 'Self-Project Set' },
  SELF_PROJECT_CLEARED: { color: 'gray', label: 'Self-Project Cleared' },
  EXTENSION_TOGGLED: { color: 'violet', label: 'Extension Toggled' },
  PERMISSION_RULE_UPDATED: { color: 'violet', label: 'Permission Rule Updated' },
  SYNC_FROM_STG: { color: 'cyan', label: 'Sync from Staging' },
}
