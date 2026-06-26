import { describe, expect, it } from 'bun:test'
import { composeTicketDescription, hasStructuredInput, resolveTicketContent } from '../../src/lib/qc-ticket-template'

describe('hasStructuredInput', () => {
  it('is false when no core field is present', () => {
    expect(hasStructuredInput({})).toBe(false)
    expect(hasStructuredInput({ environment: 'prod', browser: 'Chrome' })).toBe(false)
    expect(hasStructuredInput({ stepsToReproduce: '   ' })).toBe(false)
  })

  it('is true when any of steps/expected/actual is present', () => {
    expect(hasStructuredInput({ stepsToReproduce: '1. open' })).toBe(true)
    expect(hasStructuredInput({ expected: 'works' })).toBe(true)
    expect(hasStructuredInput({ actual: 'broken' })).toBe(true)
  })
})

describe('composeTicketDescription', () => {
  it('renders sections that have content and skips empty ones', () => {
    const md = composeTicketDescription({
      stepsToReproduce: '1. click',
      expected: 'should pass',
      actual: 'fails',
      environment: 'production',
      browser: 'Chrome 120',
      appVersion: '0.7.18',
    })
    expect(md).toContain('## Steps to reproduce\n1. click')
    expect(md).toContain('## Expected\nshould pass')
    expect(md).toContain('## Actual\nfails')
    expect(md).toContain('## Environment\nproduction · Chrome 120 · 0.7.18')
  })

  it('omits the Environment section when all env parts are blank', () => {
    const md = composeTicketDescription({ stepsToReproduce: 'a', expected: 'b', actual: 'c' })
    expect(md).not.toContain('## Environment')
  })
})

describe('resolveTicketContent', () => {
  it('returns composed description + columns for the structured path', () => {
    const r = resolveTicketContent({
      stepsToReproduce: '1. go',
      expected: 'ok',
      actual: 'bad',
      environment: 'staging',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.structured).toBe(true)
    expect(r.description).toContain('## Steps to reproduce')
    expect(r.columns.stepsToReproduce).toBe('1. go')
    expect(r.columns.environment).toBe('staging')
    expect(r.columns.browser).toBeNull()
  })

  it('rejects structured input missing a core field', () => {
    const r = resolveTicketContent({ stepsToReproduce: '1. go', expected: 'ok' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('Steps/Expected/Actual wajib diisi')
  })

  it('uses free-text description and null columns when no structured input', () => {
    const r = resolveTicketContent({ description: '  plain text  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.structured).toBe(false)
    expect(r.description).toBe('plain text')
    expect(r.columns.stepsToReproduce).toBeNull()
  })

  it('rejects when neither structured input nor description is given', () => {
    const r = resolveTicketContent({})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('description wajib diisi')
  })
})
