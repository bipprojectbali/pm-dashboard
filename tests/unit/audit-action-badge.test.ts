/**
 * Guards the audit-log action → badge map (src/.../auditlogspanel/action-badge.ts).
 *
 * The Dev Console "Log Audit" panel drives both its action-filter dropdown and
 * its row badges from `actionBadge`. Any audit action written by the backend
 * (`writeAuditLog(...)` / the auth `audit(...)` helper) that is missing from the
 * map falls back to a gray badge with the raw UPPER_SNAKE code and, crucially,
 * cannot be selected in the filter. This test fails if such drift is introduced
 * — add the new action to `action-badge.ts` and it passes again.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { actionBadge } from '../../src/frontend/components/admin/auditlogspanel/action-badge'

const SRC_DIR = join(import.meta.dir, '..', '..', 'src')

/** Recursively collect every .ts/.tsx file under src/. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Extract audit action string literals actually written by the backend.
 * Matches the 2nd argument of `writeAuditLog(actor, 'ACTION', ...)` and the auth
 * `audit(actor, 'ACTION', ...)` helper — the two ways an AuditLog row is created.
 */
function extractWrittenActions(): Set<string> {
  const actions = new Set<string>()
  // audit-writing call: writeAuditLog(<actor-expr>, 'ACTION' | "ACTION"
  const callRe = /\b(?:writeAuditLog|audit)\s*\(\s*[^,]+,\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g
  for (const file of collectSourceFiles(SRC_DIR)) {
    // Skip the badge map itself and this test's own fixtures.
    if (file.includes('action-badge')) continue
    const text = readFileSync(file, 'utf-8')
    for (const m of text.matchAll(callRe)) actions.add(m[1])
  }
  return actions
}

describe('audit action badge map', () => {
  const written = extractWrittenActions()

  test('scan finds a meaningful set of audit actions (sanity)', () => {
    // If this drops to a handful, the regex broke — fail loudly rather than
    // silently passing the coverage assertion below on an empty set.
    expect(written.size).toBeGreaterThanOrEqual(25)
    // A few well-known anchors must always be present.
    for (const anchor of ['LOGIN', 'LOGOUT', 'TASK_CREATED', 'ROLE_CHANGED']) {
      expect(written.has(anchor)).toBe(true)
    }
  })

  test('every backend-written audit action has a badge (label + color)', () => {
    const missing = [...written].filter((a) => !actionBadge[a]).sort()
    expect(missing).toEqual([])
  })

  test('every badge entry has a non-empty label and color', () => {
    for (const [action, meta] of Object.entries(actionBadge)) {
      expect(meta.color, `color for ${action}`).toBeTruthy()
      expect(meta.label, `label for ${action}`).toBeTruthy()
      // Label should be human-friendly, not the raw UPPER_SNAKE code.
      expect(meta.label, `${action} label should not be the raw code`).not.toBe(action)
    }
  })

  test('specific previously-unfilterable actions are now covered', () => {
    // The exact actions the Log Audit panel showed as raw gray badges before the fix.
    for (const action of [
      'TASK_UPDATED',
      'TASK_DELETED',
      'PHASE_CREATED',
      'PROJECT_UPDATED',
      'PROJECT_MEMBER_ADDED',
      'EVIDENCE_UPLOADED',
      'QC_TICKET_CREATED',
      'PASSWORD_CREATED',
      'ACCESS_TOKEN_CREATED',
      'AGENT_TASK_CREATED',
    ]) {
      expect(actionBadge[action], `${action} must have a badge`).toBeDefined()
    }
  })
})
