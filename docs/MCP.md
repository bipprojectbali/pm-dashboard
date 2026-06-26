# MCP Server

Local MCP server lets Claude drive the app remotely. `.mcp.json` registers 4 servers:

- `playwright` — browser automation (`@playwright/mcp@latest`)
- `pm-dashboard` — local stdio MCP against the dev DB/Redis (`scripts/mcp/server.ts`)
- `deploy-stg` — wrapper around `gh workflow run` for the Publish/Re-Pull pipeline (`scripts/mcp-deploy/server.ts`). See `@docs/DEPLOYMENT.md`.
- `pm-dashboard-stg` — remote HTTP MCP against stg (`https://pm-dashboard.wibudev.com/mcp`, Bearer `MCP_SECRET`). Readonly because stg runs with `NODE_ENV=production` — override that env to `staging` in Portainer if full CRUD is needed.

Requires `MCP_SECRET`. Scope is gated by `NODE_ENV` inside `createMcpServer()`: `production` → readonly (query tools only), anything else → admin (write + dev tools). No admin-only secret — the cap lives in code, not config.

- Entry: `scripts/mcp/server.ts` + `scripts/mcp/test-client.ts`
- Tool modules (`scripts/mcp/tools/`): `admin`, `chat`, `code`, `db`, `dev`, `events`, `extensions`, `github`, `health`, `logs`, `milestones`, `overview`, `permissions`, `phases`, `presence`, `project`, `projects`, `qc`, `redis`, `report`, `tags`, `tasks`, `tickets` (23 domains, 111 tools). Some domains span multiple files split by scope (e.g. `qc` = `qc.readonly.ts` + `qc.write.ts`, `tasks` = `tasks.ts` + `tasks.write.ts` + `tasks.checklist.ts` + `tasks.bulk.ts`); `*.helpers.ts`, `shared.ts`, and the `qc`/`tasks`/`projects` barrels are not tool modules.
- HTTP fallback: `POST /mcp` — Bearer `MCP_SECRET`. Response `x-mcp-scope` reflects the effective scope (readonly in prod, admin otherwise).

## Tools by module

- **Admin** (admin): `admin_set_user_role`, `admin_block_user`, `admin_unblock_user`, `admin_revoke_sessions`, `admin_create_user`, `admin_reset_password` — user/session management mirroring the `/api/admin/users/*` endpoints
- **DB** (readonly): `db_list_users`, `db_get_user`, `db_list_sessions`, `db_list_audit_logs`, `db_count_by_table` — direct read-only DB inspection
- **Dev** (admin): `dev_typecheck`, `dev_lint`, `dev_test`, `dev_db_migrate`, `dev_db_seed`, `dev_db_generate` — run project tooling (Bun) from MCP; gated to non-prod scope
- **Code** (readonly): `code_read_file`, `code_grep`, `code_stat` — source inspection
- **Project (dev inspection)** (readonly): `project_routes`, `project_schema`, `project_dependencies`, `project_migrations`, `project_env_map`, `project_structure` — the same scans powering the Dev Console Project tab (see `@docs/FRONTEND.md`)
- **Redis** (admin): `redis_get`, `redis_set`, `redis_del`, `redis_keys`, `redis_info`
- **Logs**: `logs_app`, `logs_audit` (readonly); `logs_clear_app`, `logs_clear_audit` (admin)
- **Permissions**: `permission_rules_list` (readonly); `permission_rule_set` (admin)
- **Health** (readonly): `health_full` — full system health snapshot
- **Presence** (readonly): `presence_online` — currently online user IDs
- **GitHub** (readonly): `github_summary`, `github_feed`, `github_webhook_logs` — all accept project id, name, or `owner/repo`. (pm-watch agents and webhook tokens are managed via the HTTP API only — there are no `agent_*` / `webhook_*` MCP tools.)
- **Projects**: `project_list`, `project_get` (readonly); `project_create`, `project_update`, `project_extend`, `project_add_member`, `project_remove_member`, `project_delete`, `project_archive`, `project_scaffold` (admin). `project_scaffold` is the seeding one-shot: project + owner + members + tags + milestones + tasks (per-task `finalStatus` walks the state machine) in a single call.
- **Tasks**: `task_list`, `task_get` (readonly); `task_create` (accepts `estimateHours`, `startsAt`, `tagIds`), `task_update` (adds `estimateHours`, `progressPercent`, `tagIds`, `actorEmail`), `task_transition` (walks shortest valid path to target status — safe for OPEN→REOPENED etc.), `task_comment`, `task_add_evidence`, `task_delete`, `task_bulk_create` (up to 100 tasks per call with per-row `finalStatus`), `task_checklist_add`/`update`/`delete`, `task_dependency_add`/`remove` (admin).
- **Tags**: `tag_list` (readonly); `tag_create`, `tag_update`, `tag_delete` (admin). Per-project tags with unique name constraint.
- **Overview** (readonly): `admin_overview` (KPIs across users/projects/tasks/agents/webhooks), `project_health` (per-project score A-F from overdue/blocked/extensions/velocity), `team_load` (per-user open/overdue/estimated hours, flags overloaded), `risk_report` (overdue tasks + stale IN_PROGRESS + past-due projects + pending agents + offline agents + missing env, severity rolled up)
- **Retro** (readonly, in `overview` module): `project_retro` (automated retrospective snapshot — markdown by default, JSON optional). (Effort metrics — variance/ghost/phantom from `src/lib/effort.ts` — are exposed via the HTTP API only; there are no `effort_*` MCP tools.)
- **Milestones**: `milestone_list` (readonly); `milestone_create`, `milestone_update`, `milestone_delete` (admin)
- **Phases**: `phase_list` (readonly); `phase_create`, `phase_update`, `phase_delete` (admin) — project phases/sprints (see `ProjectPhase` in `@docs/ARCHITECTURE.md`)
- **Report**: `report_diagnose`, `report_send_history` (readonly); `report_cron_trigger` (admin). `report_diagnose` — daily Telegram report health check; returns zoned now, schedule validity, would-fire-now, cooldown state, in-flight lock, and human-readable blockers; mirrors `GET /api/admin/report/diagnose`; never exposes secret values. `report_send_history` — recent send-history rows. `report_cron_trigger` — manually fire the daily-report cron path.
- **Tickets** (in `tickets` module): `ticket_queue` (readonly — lists open tasks tagged `ai-queue` ordered by priority then age); `ticket_pick` (admin — atomic claim via `updateMany` on highest-priority open/reopened `ai-queue` task → `IN_PROGRESS`, optional `claimerEmail` assigns, returns full ticket incl. `project.githubRepo`), `ticket_submit` (admin — posts PR link as comment + transitions `IN_PROGRESS` → `READY_FOR_QC`, then fires `notifyTaskStatusChanged` to the ticket's reporter+assignee minus the actor; see `@docs/QC-TICKETS.md` § Notifications).
  - QA/QC flow: tag a ticket with `ai-queue` → Claude runs `ticket_pick` → fix locally → open PR → `ticket_submit`.
  - Matches any project with an `ai-queue` tag regardless of self-project; in practice only the self-project has the tag, so hits are always QC tickets.
- **Extensions** (in `extensions` module): `extension_list` (readonly — semua extension + label/description/enabled, default keduanya `true`); `extension_toggle` (admin — `{ name, enabled, actorEmail? }`. Optional `actorEmail` resolve user untuk audit log `EXTENSION_TOGGLED` detail `{ name, enabled, source: 'mcp' }`. Cache 60s di-invalidate otomatis via `setSetting` hook). Lihat `@docs/FEATURES.md` § Extensions.
- **Events** (in `events` module): `event_list` (readonly — filter upcoming/past, limit); `event_create`, `event_update`, `event_delete` (admin)
- **Chat AI** (in `chat` module):
  - Readonly: `chat_doc_search` (pgvector + FTS + trigram search over `chat_document`, optional `type` filter, return hits with metadata); `chat_doc_stats` (total docs, breakdown per type, lastSync)
  - Admin: `chat_sync_run` (`full=false` incremental, `full=true` aggregate refresh + retro + orphan prune; returns `{ synced, pruned, failedEmbeddings, durationMs }`)
  - See `@docs/CHAT-AI.md` for doc-type catalog and search algorithm.
- **QC** (in `qc` module):
  - Readonly: `qc_self_project_get`, `qc_context`, `qc_ticket_list` (filter `status`/`priority`, free-text `q` over title/description/route, `sort` ∈ `priority|created|updated|title` + `order`, paginated via `page` + `limit` ≤200; returns `{ count, page, limit, total, totalPages, tickets }`), `qc_ticket_get`, `qc_ticket_find_similar` (trigram duplicate check over open `ai-queue` tickets — `{ title, limit? ≤20 }` → `{ count, possibleDuplicates: [{ id, title, status, priority, score }] }`; `CLOSED` excluded, `[]` if no self-project or `pg_trgm` unavailable; use before `qc_ticket_create` to avoid duplicate queue entries)
  - Admin: `qc_self_project_set`, `qc_self_project_clear`, `qc_ticket_create`, `qc_ticket_update`, `qc_ticket_bulk_update` (apply same `status`/`priority`/`assigneeEmail` to up to 100 `ai-queue` tickets in one atomic `$transaction`; status changes write `TaskStatusChange`, `assigneeEmail=""`/null unassigns; ids outside self-project silently skipped), `qc_ticket_delete`, `qc_ticket_comment`, `qc_ticket_evidence_add`
  - Operates on the one project where `isSelf=true`.
