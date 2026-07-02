// Machine-readable guide (llmstxt.org format) for coding agents accessing the
// project via the token-scoped REST surface. Base URL is injected per request
// so the doc is correct in dev/stg/prod without hardcoding (rule 15).
export function renderLlmsTxt(baseUrl: string): string {
  return `# pm-dashboard — Agent API

> Project management app. Coding agents (Claude Code, CLI scripts) read/update a single project's tasks, bugs, and tickets through a lightweight token-scoped REST API. Each project issues its own access token; the token fixes the project and permission — you never pass a project id.

## Authentication

- Every request needs header: \`Authorization: Bearer pmt_...\`
- Get a token: project → Settings → Access Tokens → create (choose READ or WRITE).
- Scope: \`READ\` tokens can GET; \`WRITE\` tokens can also POST/PATCH/DELETE.
- The token is scoped to ONE project. Tasks in other projects return 404.

## Rules

- Do NOT send a project id — it comes from the token.
- \`IDEA\`-kind tasks are read-only via token (create/update rejected). Promote an idea to a task in the UI first.
- Status transitions follow a kind-aware state machine (invalid transitions return 400):
  - TASK: \`OPEN → IN_PROGRESS → CLOSED\`; \`IN_PROGRESS → OPEN\`; \`CLOSED → REOPENED → {IN_PROGRESS, CLOSED}\`. (TASK has no READY_FOR_QC.)
  - BUG / QC / TICKET: \`OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED\`; \`READY_FOR_QC → REOPENED\`; \`CLOSED → REOPENED\`.
- Errors: 401 (bad/missing/expired/revoked token), 403 (READ token attempting a write, or IDEA mutation), 404 (task not in your project), 400 (bad body / invalid enum / invalid transition / malformed JSON).

## Response envelope

- List: \`{ count, page, limit, total, totalPages, tasks: [...] }\` — \`count\` is rows on THIS page; \`total\` is all matching rows in the project. Iterate pages until \`page >= totalPages\`.
- Single: \`{ task }\`, \`{ project }\`, \`{ comment }\`, \`{ item }\`, \`{ ok: true }\`.
- Every task carries computed \`actualHours\` (null until closed) and \`progressPercent\`.

## Endpoints

Base URL: \`${baseUrl}\`

### List tasks — GET /api/agent/tasks
Query (optional): \`status\`, \`kind\`, \`assigneeEmail\`, \`page\` (default 1), \`limit\` (default 50, max 200). Invalid \`status\`/\`kind\` → 400. List items are lean (comment/evidence as counts only) — use the detail route to read bodies.
\`\`\`
curl -H "Authorization: Bearer pmt_..." "${baseUrl}/api/agent/tasks?status=OPEN&page=1&limit=50"
\`\`\`

### Task stats — GET /api/agent/tasks/stats
Aggregate counts for the whole project (all pages): \`{ total, byStatus: { open, inProgress, readyForQc, reopened, closed, total }, byPriority, byKind }\`. \`total\` includes IDEA; \`byKind\` breaks it out.
\`\`\`
curl -H "Authorization: Bearer pmt_..." "${baseUrl}/api/agent/tasks/stats"
\`\`\`

### Get a task — GET /api/agent/tasks/:id
Full detail: scalars + \`comments\` (with author + body), \`evidence\` (url/note), \`statusChanges\` (history), and \`checklist\` items (with \`id\` + \`title\` — needed to PATCH/DELETE them).
\`\`\`
curl -H "Authorization: Bearer pmt_..." "${baseUrl}/api/agent/tasks/<taskId>"
\`\`\`

### Project metadata — GET /api/agent/project
The token's project: name, description, status, members (with email — use for \`assigneeEmail\`), phases, milestones, task/member counts.
\`\`\`
curl -H "Authorization: Bearer pmt_..." "${baseUrl}/api/agent/project"
\`\`\`

### Create a task — POST /api/agent/tasks  (WRITE)
Body: \`title\` (required), \`description\` (required), \`kind\`? (TASK|BUG|QC|TICKET), \`priority\`? (LOW|MEDIUM|HIGH|CRITICAL), \`assigneeEmail\`?, \`dueAt\`? (ISO), \`estimateHours\`?.
\`\`\`
curl -X POST -H "Authorization: Bearer pmt_..." -H "Content-Type: application/json" \\
  -d '{"title":"Fix login","description":"500 on /login","kind":"BUG","priority":"HIGH"}' \\
  "${baseUrl}/api/agent/tasks"
\`\`\`

### Update a task — PATCH /api/agent/tasks/:id  (WRITE)
Body (all optional): \`title\`, \`description\`, \`priority\`, \`status\` (drives transition), \`assigneeEmail\` (null to unassign), \`dueAt\`, \`estimateHours\`, \`progressPercent\`.
\`\`\`
curl -X PATCH -H "Authorization: Bearer pmt_..." -H "Content-Type: application/json" \\
  -d '{"status":"IN_PROGRESS"}' "${baseUrl}/api/agent/tasks/<taskId>"
\`\`\`

### Comment on a task — POST /api/agent/tasks/:id/comments  (WRITE)
Body: \`body\` (required). Comment is tagged AGENT. Read comments back via the detail route.
\`\`\`
curl -X POST -H "Authorization: Bearer pmt_..." -H "Content-Type: application/json" \\
  -d '{"body":"Started work, PR incoming"}' "${baseUrl}/api/agent/tasks/<taskId>/comments"
\`\`\`

### Checklist — WRITE
- Add: \`POST /api/agent/tasks/:id/checklist\` body \`{ "title": "..." }\`
- Update: \`PATCH /api/agent/checklist/:itemId\` body \`{ "title"?, "done"? }\`
- Delete: \`DELETE /api/agent/checklist/:itemId\`

Get checklist item ids from the task detail route (\`GET /api/agent/tasks/:id\` → \`checklist[].id\`).

## Alternative: MCP

For interactive Claude Code sessions, the same token authenticates an MCP endpoint at \`${baseUrl}/mcp\` (Streamable HTTP). The REST API above is lighter for scripts/CLI and one-shot commands.
`
}
