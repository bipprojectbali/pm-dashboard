# MCP Server

Local MCP server lets Claude drive the app remotely. `.mcp.json` registers 4 servers:

- `playwright` — browser automation (`@playwright/mcp@latest`)
- `pm-dashboard` — local stdio MCP against the dev DB/Redis (`scripts/mcp/server.ts`)
- `deploy-stg` — wrapper around `gh workflow run` for the Publish/Re-Pull pipeline (`scripts/mcp-deploy/server.ts`). See `@docs/DEPLOYMENT.md`.
- `pm-dashboard-stg` — remote HTTP MCP against stg (`https://pm-dashboard.wibudev.com/mcp`, Bearer `MCP_SECRET`). Readonly because stg runs with `NODE_ENV=production` — override that env to `staging` in Portainer if full CRUD is needed.

Requires `MCP_SECRET`. Scope is gated by `NODE_ENV` inside `createMcpServer()`: `production` → readonly (query tools only), anything else → admin (write + dev tools). No admin-only secret — the cap lives in code, not config.

- Entry: `scripts/mcp/server.ts` + `scripts/mcp/test-client.ts`
- Tool modules (`scripts/mcp/tools/`): `admin`, `agents`, `code`, `db`, `dev`, `github`, `health`, `logs`, `milestones`, `overview`, `presence`, `project`, `projects`, `qc`, `redis`, `tags`, `tasks`, `tickets`, `webhooks` (19 modules, 106 tools). `shared.ts` is a helper, not a tool module.
- HTTP fallback: `POST /mcp` — Bearer `MCP_SECRET`. Response `x-mcp-scope` reflects the effective scope (readonly in prod, admin otherwise).

## Tools by module

- **Agents**: `agent_list`, `agent_get` (readonly); `agent_approve`, `agent_revoke`, `agent_reassign` (admin)
- **Webhooks**: `webhook_token_list`, `webhook_stats`, `webhook_logs` (readonly); `webhook_token_create` (returns plaintext once), `webhook_token_toggle`, `webhook_token_revoke` (admin)
- **GitHub** (readonly): `github_summary`, `github_feed`, `github_webhook_logs` — all accept project id, name, or `owner/repo`
- **Projects**: `project_list`, `project_get` (readonly); `project_create`, `project_update`, `project_extend`, `project_add_member`, `project_remove_member`, `project_delete`, `project_archive`, `project_scaffold` (admin). `project_scaffold` is the seeding one-shot: project + owner + members + tags + milestones + tasks (per-task `finalStatus` walks the state machine) in a single call.
- **Tasks**: `task_list`, `task_get` (readonly); `task_create` (accepts `estimateHours`, `startsAt`, `tagIds`), `task_update` (adds `estimateHours`, `progressPercent`, `tagIds`, `actorEmail`), `task_transition` (walks shortest valid path to target status — safe for OPEN→REOPENED etc.), `task_comment`, `task_add_evidence`, `task_delete`, `task_bulk_create` (up to 100 tasks per call with per-row `finalStatus`), `task_checklist_add`/`update`/`delete`, `task_dependency_add`/`remove` (admin).
- **Tags**: `tag_list` (readonly); `tag_create`, `tag_update`, `tag_delete` (admin). Per-project tags with unique name constraint.
- **Overview** (readonly): `admin_overview` (KPIs across users/projects/tasks/agents/webhooks), `project_health` (per-project score A-F from overdue/blocked/extensions/velocity), `team_load` (per-user open/overdue/estimated hours, flags overloaded), `risk_report` (overdue tasks + stale IN_PROGRESS + past-due projects + pending agents + offline agents + missing env, severity rolled up)
- **Effort** (readonly, in `overview` module): `effort_report` (estimate vs actual for many tasks), `task_effort` (single task detail), `ghost_tasks` (stalled IN_PROGRESS with user-online signal), `phantom_work` (per-user untracked activity)
- **Retro** (readonly, in `overview` module): `project_retro` (automated retrospective snapshot — markdown by default, JSON optional)
- **Tickets** (in `tickets` module): `ticket_queue` (readonly — lists open tasks tagged `ai-queue` ordered by priority then age); `ticket_pick` (admin — atomic claim via `updateMany` on highest-priority open/reopened `ai-queue` task → `IN_PROGRESS`, optional `claimerEmail` assigns, returns full ticket incl. `project.githubRepo`), `ticket_submit` (admin — posts PR link as comment + transitions `IN_PROGRESS` → `READY_FOR_QC`).
  - QA/QC flow: tag a ticket with `ai-queue` → Claude runs `ticket_pick` → fix locally → open PR → `ticket_submit`.
  - Matches any project with an `ai-queue` tag regardless of self-project; in practice only the self-project has the tag, so hits are always QC tickets.
- **QC** (in `qc` module):
  - Readonly: `qc_self_project_get`, `qc_context`, `qc_ticket_list`, `qc_ticket_get`
  - Admin: `qc_self_project_set`, `qc_self_project_clear`, `qc_ticket_create`, `qc_ticket_update`, `qc_ticket_delete`, `qc_ticket_comment`, `qc_ticket_evidence_add`
  - Operates on the one project where `isSelf=true`.
