export type EventRow = {
  projectId: string
  kind: 'PUSH_COMMIT' | 'PR_OPENED' | 'PR_CLOSED' | 'PR_MERGED' | 'PR_REVIEWED'
  actorLogin: string
  actorEmail: string | null
  matchedUserId: string | null
  title: string
  url: string
  sha: string | null
  prNumber: number | null
  metadata: object | null
  createdAt: Date
}

export function parseGithubEvents(
  event: string,
  payload: Record<string, unknown>,
  repoFullName: string,
  projectId: string,
): EventRow[] {
  if (event === 'push') return parsePushEvents(payload, repoFullName, projectId)
  if (event === 'pull_request') return parsePrEvents(payload, repoFullName, projectId)
  if (event === 'pull_request_review') return parsePrReviewEvents(payload, repoFullName, projectId)
  return []
}

function parsePushEvents(payload: Record<string, unknown>, repoFullName: string, projectId: string): EventRow[] {
  const commits = (payload.commits as Array<Record<string, unknown>>) ?? []
  const pusher = payload.pusher as { name?: string; email?: string } | undefined
  const rows: EventRow[] = []
  for (const c of commits) {
    const id = typeof c.id === 'string' ? c.id : null
    if (!id) continue
    const author = c.author as { name?: string; email?: string; username?: string } | undefined
    const message = typeof c.message === 'string' ? c.message : ''
    const timestamp = typeof c.timestamp === 'string' ? new Date(c.timestamp) : new Date()
    const url = typeof c.url === 'string' ? c.url : `https://github.com/${repoFullName}/commit/${id}`
    rows.push({
      projectId,
      kind: 'PUSH_COMMIT',
      actorLogin: author?.username ?? author?.name ?? pusher?.name ?? 'unknown',
      actorEmail: author?.email ?? pusher?.email ?? null,
      matchedUserId: null,
      title: message.split('\n')[0].slice(0, 500),
      url,
      sha: id,
      prNumber: null,
      metadata: { ref: payload.ref ?? null, added: c.added ?? [], removed: c.removed ?? [], modified: c.modified ?? [] },
      createdAt: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    })
  }
  return rows
}

function parsePrEvents(payload: Record<string, unknown>, repoFullName: string, projectId: string): EventRow[] {
  const action = typeof payload.action === 'string' ? payload.action : ''
  const pr = payload.pull_request as
    | { number?: number; title?: string; html_url?: string; merged?: boolean; user?: { login?: string }; merged_at?: string | null; closed_at?: string | null; created_at?: string }
    | undefined
  const kind: EventRow['kind'] | null =
    action === 'opened' || action === 'reopened'
      ? 'PR_OPENED'
      : action === 'closed'
        ? pr?.merged ? 'PR_MERGED' : 'PR_CLOSED'
        : null
  if (!kind || pr?.number == null) return []
  const ts =
    kind === 'PR_MERGED' && pr.merged_at ? new Date(pr.merged_at)
    : kind === 'PR_CLOSED' && pr.closed_at ? new Date(pr.closed_at)
    : pr.created_at ? new Date(pr.created_at)
    : new Date()
  return [{
    projectId,
    kind,
    actorLogin: pr.user?.login ?? 'unknown',
    actorEmail: null,
    matchedUserId: null,
    title: (pr.title ?? '').slice(0, 500),
    url: pr.html_url ?? `https://github.com/${repoFullName}/pull/${pr.number}`,
    sha: null,
    prNumber: pr.number,
    metadata: { action, merged: pr.merged ?? false },
    createdAt: Number.isNaN(ts.getTime()) ? new Date() : ts,
  }]
}

function parsePrReviewEvents(payload: Record<string, unknown>, repoFullName: string, projectId: string): EventRow[] {
  const pr = payload.pull_request as { number?: number; html_url?: string; title?: string } | undefined
  const review = payload.review as { state?: string; user?: { login?: string }; submitted_at?: string } | undefined
  if (pr?.number == null || !review) return []
  const ts = review.submitted_at ? new Date(review.submitted_at) : new Date()
  return [{
    projectId,
    kind: 'PR_REVIEWED',
    actorLogin: review.user?.login ?? 'unknown',
    actorEmail: null,
    matchedUserId: null,
    title: `${review.state ?? 'reviewed'}: ${(pr.title ?? '').slice(0, 480)}`,
    url: pr.html_url ?? `https://github.com/${repoFullName}/pull/${pr.number}`,
    sha: null,
    prNumber: pr.number,
    metadata: { state: review.state ?? null },
    createdAt: Number.isNaN(ts.getTime()) ? new Date() : ts,
  }]
}
