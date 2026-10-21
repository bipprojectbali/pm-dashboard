import { describe, expect, it } from 'bun:test'
import { redactLogText } from '../../src/lib/applog'

describe('redactLogText', () => {
  it('masks an email in a log message, keeping the domain', () => {
    expect(redactLogText('Project created: Apollo by budi@wibudev.com')).toBe(
      'Project created: Apollo by b***@wibudev.com',
    )
  })

  it('masks an email in a detail string', () => {
    expect(redactLogText('ip=10.0.0.1 actor=admin.user@sub.example.co.id')).toBe(
      'ip=10.0.0.1 actor=a***@sub.example.co.id',
    )
  })

  it('leaves a message without an email byte-for-byte unchanged', () => {
    const msg = 'Task soft-deleted: #42 by cmg1x2y3z4 — kanbanOrder 3 → 7 (100%)'
    expect(redactLogText(msg)).toBe(msg)
  })

  it('masks every email when one message holds several', () => {
    expect(redactLogText('Role changed: target@a.com by actor@b.org')).toBe(
      'Role changed: t***@a.com by a***@b.org',
    )
  })

  it('never leaks the local part beyond its first character', () => {
    const out = redactLogText('Login failed: verylonglocalpart+tag@example.com')
    expect(out).not.toContain('verylonglocalpart')
    expect(out).not.toContain('+tag')
    expect(out).toBe('Login failed: v***@example.com')
  })

  it('does not mangle non-email at-signs or empty input', () => {
    expect(redactLogText('')).toBe('')
    expect(redactLogText('scope=@all cost=$5 @mention')).toBe('scope=@all cost=$5 @mention')
  })

  it('does not pretend to redact an opaque token (must not reach appLog)', () => {
    // An opaque credential has no matchable shape — this asserts the documented
    // limitation so nobody mistakes the sink guard for credential protection.
    const raw = 'pmt_8f3a9c1d2e4b5a6f'
    expect(redactLogText(`MCP token ${raw}`)).toContain(raw)
  })
})
