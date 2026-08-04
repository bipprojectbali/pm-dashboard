// Phase authorization — deliberately SEPARATE from canManageProject (which is
// used by 8 other project features and must not change). Phases have a stricter,
// creator-aware rule requested by the product owner:
//
//   Create : project OWNER / PM, or SUPER_ADMIN.
//   Modify : project OWNER, SUPER_ADMIN, or a PM (update + delete share this).
//            A PM may modify any phase with no recorded creator (legacy rows,
//            createdById = null) — treated as project-owned. For phases with a
//            recorded creator, a PM may only modify the one they created.
//
// Note: a plain ADMIN (non-SUPER_ADMIN) gets NO system bypass here — they only
// pass via their own project membership. This is intentional and differs from
// isSystemAdmin.
import type { ProjectRole } from './project-access'

type Auth = { userId: string; role: string }
type Membership = { role: ProjectRole } | null

export function canCreatePhase(auth: Auth, membership: Membership): boolean {
  if (auth.role === 'SUPER_ADMIN') return true
  return membership?.role === 'OWNER' || membership?.role === 'PM'
}

export function canModifyPhase(auth: Auth, membership: Membership, phase: { createdById: string | null }): boolean {
  if (auth.role === 'SUPER_ADMIN') return true
  if (membership?.role === 'OWNER') return true
  if (membership?.role === 'PM' && (phase.createdById == null || phase.createdById === auth.userId)) return true
  return false
}
