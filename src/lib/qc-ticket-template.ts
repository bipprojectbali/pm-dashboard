// Structured QC bug-report fields. Reporters fill these in the create form so Claude
// (which drains the ai-queue via ticket_pick) receives full reproduction context.
// The fields are stored as their own Task columns for query-ability AND composed into
// the `description` markdown so every existing reader (drawer, ticket_pick) stays
// full-context with no new render code.
export interface StructuredTicketFields {
  stepsToReproduce?: string | null
  expected?: string | null
  actual?: string | null
  environment?: string | null
  browser?: string | null
  appVersion?: string | null
}

const clean = (v: string | null | undefined): string => (v ?? '').trim()

/** True when the reporter supplied any of the core structured fields (steps/expected/actual). */
export function hasStructuredInput(fields: StructuredTicketFields): boolean {
  return Boolean(clean(fields.stepsToReproduce) || clean(fields.expected) || clean(fields.actual))
}

/** Render structured fields into a markdown description. Empty sections are skipped. */
export function composeTicketDescription(fields: StructuredTicketFields): string {
  const sections: string[] = []
  const steps = clean(fields.stepsToReproduce)
  const expected = clean(fields.expected)
  const actual = clean(fields.actual)
  if (steps) sections.push(`## Steps to reproduce\n${steps}`)
  if (expected) sections.push(`## Expected\n${expected}`)
  if (actual) sections.push(`## Actual\n${actual}`)

  const envParts = [clean(fields.environment), clean(fields.browser), clean(fields.appVersion)].filter(Boolean)
  if (envParts.length) sections.push(`## Environment\n${envParts.join(' · ')}`)

  return sections.join('\n\n')
}

export interface TicketCreateInput extends StructuredTicketFields {
  title?: string | null
  description?: string | null
}

/** The 6 structured columns, normalized — null when the structured path is not taken. */
export interface TicketColumns {
  stepsToReproduce: string | null
  expected: string | null
  actual: string | null
  environment: string | null
  browser: string | null
  appVersion: string | null
}

export type TicketContent =
  | { ok: false; error: string }
  | { ok: true; description: string; structured: boolean; columns: TicketColumns }

const NULL_COLUMNS: TicketColumns = {
  stepsToReproduce: null,
  expected: null,
  actual: null,
  environment: null,
  browser: null,
  appVersion: null,
}

/**
 * Validate a ticket create payload and resolve its `description` + structured columns.
 * Structured path (any of steps/expected/actual present) requires all three core fields
 * and composes the markdown description. Otherwise falls back to the free-text description.
 * Shared by the HTTP route and the MCP tool so validation stays identical.
 */
export function resolveTicketContent(input: TicketCreateInput): TicketContent {
  const structured = hasStructuredInput(input)
  if (structured) {
    if (!clean(input.stepsToReproduce) || !clean(input.expected) || !clean(input.actual)) {
      return { ok: false, error: 'Steps/Expected/Actual wajib diisi' }
    }
    return {
      ok: true,
      structured: true,
      description: composeTicketDescription(input),
      columns: {
        stepsToReproduce: clean(input.stepsToReproduce),
        expected: clean(input.expected),
        actual: clean(input.actual),
        environment: clean(input.environment) || null,
        browser: clean(input.browser) || null,
        appVersion: clean(input.appVersion) || null,
      },
    }
  }
  if (!clean(input.description)) return { ok: false, error: 'description wajib diisi' }
  return { ok: true, structured: false, description: clean(input.description), columns: { ...NULL_COLUMNS } }
}
