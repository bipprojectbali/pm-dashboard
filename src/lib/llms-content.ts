// Machine-readable guide (llmstxt.org format) for coding agents accessing the
// project via the token-scoped REST surface. Base URL is injected per request
// so the doc is correct in dev/stg/prod without hardcoding (rule 15).
export function renderLlmsTxt(baseUrl: string): string {
  return `# pm-dashboard — Agent API

> Project management app. Coding agents (Claude Code, CLI scripts) read/update a single project's tasks, bugs, and tickets through a lightweight token-scoped REST API. Each project issues its own access token; the token fixes the project and permission — you never pass a project id.

## Authentication

- Every request needs header: \`Authorization: Bearer pmt_...\`
- Get a token: project → Settings → Access Tokens → create (choose READ or WRITE).
- Scope: \`READ\` tokens can GET; \`WRITE\` tokens can also POST/PATCH.
- The token is scoped to ONE project. Tasks in other projects return 404.

## Rules

- Do NOT send a project id — it comes from the token.
- \`IDEA\`-kind tasks are read-only via token (create/update rejected). Promote an idea to a task in the UI first.
- Status transitions follow the state machine: OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED, with REOPENED from CLOSED. Invalid transitions return 400.
- Errors: 401 (bad/missing/expired/revoked token), 403 (READ token attempting a write, or IDEA mutation), 404 (task not in your project), 400 (bad body).

## Endpoints

Base URL: \`${baseUrl}\`

### List tasks — GET /api/agent/tasks
Query (optional): \`status\`, \`kind\`, \`assigneeEmail\`, \`limit\` (max 200).
\`\`\`
curl -H "Authorization: Bearer pmt_..." "${baseUrl}/api/agent/tasks?status=OPEN"
\`\`\`

### Get a task — GET /api/agent/tasks/:id
\`\`\`
curl -H "Authorization: Bearer pmt_..." "${baseUrl}/api/agent/tasks/<taskId>"
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
Body: \`body\` (required). Comment is tagged AGENT.
\`\`\`
curl -X POST -H "Authorization: Bearer pmt_..." -H "Content-Type: application/json" \\
  -d '{"body":"Started work, PR incoming"}' "${baseUrl}/api/agent/tasks/<taskId>/comments"
\`\`\`

### Checklist — WRITE
- Add: \`POST /api/agent/tasks/:id/checklist\` body \`{ "title": "..." }\`
- Update: \`PATCH /api/agent/checklist/:itemId\` body \`{ "title"?, "done"? }\`
- Delete: \`DELETE /api/agent/checklist/:itemId\`

## Alternative: MCP

For interactive Claude Code sessions, the same token authenticates an MCP endpoint at \`${baseUrl}/mcp\` (Streamable HTTP). The REST API above is lighter for scripts/CLI and one-shot commands.
`
}
