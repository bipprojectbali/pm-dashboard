// Barrel: route helpers split by concern into focused modules. Import sites can
// keep importing from here, or point directly at the concern-specific module.
export { writeAuditLog } from './audit-log'
export { getIp, getPublicOrigin } from './http-request'
export {
  canGrantProjectOwner,
  canManageProject,
  canReadProject,
  isSystemAdmin,
  type ProjectRole,
  requireProjectMember,
} from './project-access'
export {
  extractSessionToken,
  requireAuth,
  SESSION_REFRESH_THRESHOLD_SEC,
  SESSION_TTL_SEC,
  sessionCookie,
} from './session-auth'
export { computeActualHours, computeProgressPercent } from './task-computed'
export { getAllowedTaskTransitions, isStatusValidForKind } from './task-lifecycle'
