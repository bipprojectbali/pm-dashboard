# HTTP API

Schemas, enums, and helpers live in `@docs/ARCHITECTURE.md`. Feature-specific APIs split out:
- Overview / Effort / Retro → `@docs/FEATURES.md`
- pm-watch + GitHub webhooks → `@docs/INTEGRATIONS.md`
- QC tickets → `@docs/QC-TICKETS.md`

## Admin API (SUPER_ADMIN only)

- `GET /api/admin/users` — list all users with role, blocked status, createdAt
- `PUT /api/admin/users/:id/role` — change role to USER or ADMIN (cannot change self or to SUPER_ADMIN)
- `PUT /api/admin/users/:id/block` — block/unblock user (deletes all sessions on block)
- `GET /api/admin/presence` — list online user IDs
- `GET /api/admin/logs/app` — app logs from Redis (filter: level, limit, afterId)
- `GET /api/admin/logs/audit` — audit logs from DB (filter: userId, action, limit)
- `DELETE /api/admin/logs/app` — clear all app logs from Redis
- `DELETE /api/admin/logs/audit` — clear all audit logs from DB
- `GET /api/admin/routes` — all routes metadata (method, path, auth level, category, description) with summary stats
- `GET /api/admin/project-structure` — scans `src/`, `prisma/`, `tests/` — returns files with line counts, exports, imports, categories + directory tree
- `GET /api/admin/env-map` — environment variables with set/unset status, required/optional, default values, consuming files
- `GET /api/admin/test-coverage` — source files + test files mapping, coverage status (covered/partial/uncovered)
- `GET /api/admin/dependencies` — NPM packages from package.json with version, type (runtime/dev), category, importing files
- `GET /api/admin/migrations` — Prisma migration timeline with parsed SQL changes and date info
- `GET /api/admin/sessions` — all active sessions with user info, online status, expiry, role breakdown
- `GET /api/admin/agents` — list pm-watch agents with claimedBy user + event counts
- `POST /api/admin/agents/:id/approve` — approve PENDING agent and assign to a user
- `POST /api/admin/agents/:id/revoke` — revoke APPROVED agent (events preserved, reversible)
- `GET /api/admin/webhook-tokens` — list webhook tokens (hashes never returned)
- `POST /api/admin/webhook-tokens` — create token (plaintext returned **once** only)
- `PATCH /api/admin/webhook-tokens/:id` — toggle ACTIVE/DISABLED or rename
- `POST /api/admin/webhook-tokens/:id/revoke` — permanently revoke token
- `GET /api/admin/webhooks/stats` — aggregate stats (24h + 7d windows): total/success/fail/auth-fail/events, perToken, perAgent
- `GET /api/admin/webhooks/logs?status=all|ok|fail|auth&limit=N` — recent webhook request logs with token/agent relations

## Projects + Tasks

Projects and tasks are project-scoped; all write endpoints gate on `requireProjectMember`. Role hierarchy (inside a project): `OWNER > PM > MEMBER > VIEWER`. `SUPER_ADMIN` bypasses membership checks.

- `GET /api/projects` — list projects visible to current user (owned or member of); counts and task stats
- `POST /api/projects` — create (auto-adds creator as `OWNER`)
- `GET /api/projects/:id` — full detail (members, milestones, extensions, recent tasks) + `myRole`
- `PATCH /api/projects/:id` — update fields (OWNER/PM). Accepts `githubRepo` (normalized server-side, `null` to unlink; 409 on duplicate link)
- `DELETE /api/projects/:id` — permanent delete with cascade (OWNER or SUPER_ADMIN). Audited.
- Project members, milestones, extensions — usual CRUD under `/api/projects/:id/*`
- `GET/POST /api/projects/:id/tags` — list/create per-project tags; unique by (projectId, name)
- `PATCH/DELETE /api/tags/:id` — rename/recolor or delete (cascades to TaskTag)
- `GET /api/tasks` — list with filters (`projectId`, `status`, `kind`, `assigneeId`, `tagId`). Response enriches each task with `actualHours`, `progressPercent`, `tags`, counts for blockedBy/blocks/checklist.
- `POST /api/tasks` — create, accepts `startsAt`, `dueAt`, `estimateHours`, `tagIds[]`
- `GET /api/tasks/:id` — full detail incl. tags, blockedBy, blocks, checklist, statusChanges, comments, evidence + computed `actualHours`/`progressPercent`
- `PATCH /api/tasks/:id` — updates (status writes `TaskStatusChange`). Accepts `tagIds` (replace set), `progressPercent`, `estimateHours`, dates.
- `DELETE /api/tasks/:id` — OWNER/PM/SUPER_ADMIN
- `POST /api/tasks/:id/comments`, `POST /api/tasks/:id/evidence` — add-only
- `POST /api/tasks/:id/dependencies` (body: `blockedById`) / `DELETE /api/tasks/:id/dependencies/:blockedById`
- `POST /api/tasks/:id/checklist`, `PATCH/DELETE /api/checklist/:id`

### Computed task fields (not stored)

- `actualHours` = `closedAt − (startsAt ?? createdAt)` in hours, rounded to 2dp. `null` until closed.
- `progressPercent`: 100 if `CLOSED`; else ratio of checklist.done / checklist.length if checklist non-empty; else manual `progressPercent` column value.
