import type { RetroResult } from './types'

function fmtDate(d: Date | null | undefined) {
  if (!d) return '—'
  return d.toISOString().slice(0, 10)
}

export function renderRetroMarkdown(r: RetroResult): string {
  const lines: string[] = []
  lines.push(`# Retrospective — ${r.project.name}`)
  lines.push('')
  lines.push(`**Window:** ${fmtDate(r.window.since)} → ${fmtDate(r.window.until)} (${r.window.days}d)`)
  lines.push(`**Project status:** ${r.project.status}`)
  if (r.project.endsAt) lines.push(`**Deadline:** ${fmtDate(r.project.endsAt)}`)
  lines.push('')

  lines.push('## TL;DR')
  lines.push(
    `- ✅ ${r.summary.closed} tasks shipped (${r.summary.estimateHoursClosed}h estimated) · 🐢 ${r.summary.slipped} slipped · 🚧 ${r.summary.stillBlocked} still blocked`,
  )
  lines.push(
    `- 📅 ${r.summary.extensions} deadline push${r.summary.extensions === 1 ? '' : 'es'} · 🆕 ${r.summary.newTasks} new tasks created`,
  )
  if (r.github.commits + r.github.prsOpened + r.github.prsMerged > 0) {
    lines.push(
      `- 🐙 GitHub: ${r.github.commits} commits, ${r.github.prsOpened} PRs opened, ${r.github.prsMerged} merged, ${r.github.reviews} reviews`,
    )
  }
  lines.push('')

  if (r.shipped.length > 0) {
    lines.push('## Shipped')
    for (const t of r.shipped.slice(0, 25))
      lines.push(`- **${t.title}** (${t.priority}) — ${t.assigneeEmail ?? 'unassigned'} · closed ${fmtDate(t.closedAt)}`)
    if (r.shipped.length > 25) lines.push(`- _…and ${r.shipped.length - 25} more_`)
    lines.push('')
  }

  if (r.slipped.length > 0) {
    lines.push('## Slipped')
    for (const t of r.slipped.slice(0, 25))
      lines.push(`- **${t.title}** (${t.priority}) — ${t.assigneeEmail ?? 'unassigned'} · due ${fmtDate(t.dueAt)} · ${t.closedAt ? `closed ${fmtDate(t.closedAt)}` : 'still open'}`)
    if (r.slipped.length > 25) lines.push(`- _…and ${r.slipped.length - 25} more_`)
    lines.push('')
  }

  if (r.biggestMisses.length > 0) {
    lines.push('## Biggest misses')
    for (const t of r.biggestMisses)
      lines.push(`- **${t.title}** — ${t.daysOverDue}d overdue · ${t.assigneeEmail ?? 'unassigned'}`)
    lines.push('')
  }

  if (r.stillBlocked.length > 0) {
    lines.push('## Still blocked')
    for (const t of r.stillBlocked.slice(0, 15))
      lines.push(`- **${t.title}** (${t.priority}) — ${t.assigneeEmail ?? 'unassigned'}`)
    if (r.stillBlocked.length > 15) lines.push(`- _…and ${r.stillBlocked.length - 15} more_`)
    lines.push('')
  }

  if (r.extensions.length > 0) {
    lines.push('## Deadline pushes')
    for (const e of r.extensions)
      lines.push(`- ${fmtDate(e.previousEndAt)} → ${fmtDate(e.newEndAt)} by ${e.extendedBy ?? 'system'}${e.reason ? ` — ${e.reason}` : ''}`)
    lines.push('')
  }

  if (r.contributors.length > 0) {
    lines.push('## Top contributors')
    for (const c of r.contributors)
      lines.push(`- **${c.name ?? c.email ?? 'unknown'}** — ${c.closed} closed · ${c.commits} commits · ${c.prsMerged} PRs merged`)
    lines.push('')
  }

  lines.push('---')
  lines.push(`_Generated ${new Date().toISOString()} by pm-dashboard._`)
  return lines.join('\n')
}
