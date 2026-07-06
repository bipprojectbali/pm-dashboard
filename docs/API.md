# HTTP API

Schemas, enums, and helpers live in `@docs/ARCHITECTURE.md`. Feature-specific APIs split out:
- Overview / Effort / Retro → `@docs/FEATURES.md`
- pm-watch + GitHub webhooks → `@docs/INTEGRATIONS.md`
- QC tickets → `@docs/QC-TICKETS.md`
- `POST /mcp` (+ `GET`/`DELETE`) — token-scoped HTTP MCP for agents; auth `Bearer pmt_` project token (not session). See `@docs/INTEGRATIONS.md` § HTTP MCP endpoint.
- `/api/agent/*` — token-only REST surface for CLI agents (lighter than MCP); auth `Bearer pmt_`. See § Agent REST API below + `GET /api/agent/guide` (auth-gated machine-readable guide).

## Agent REST API (`/api/agent/*`)

Token-only surface (no session) for coding agents / CLI. Auth `Authorization: Bearer pmt_…` (project access token). Auto-scoped to the token's project — never pass `projectId`. READ token → GET; WRITE token → + POST/PATCH/DELETE. `IDEA`-kind read-only. Cross-project access → 404 (no-leak). Errors: 401 (bad/expired/revoked token), 403 (READ doing write, or IDEA mutation), 404, 400 (bad body / invalid enum / invalid transition / malformed JSON — never a 500). Route split: `src/routes/agent/` (`tasks.route.ts` reads, `writes.route.ts`, `checklist.route.ts`, `project.route.ts`, `shared.ts`, `index.ts` barrel).

**Rate limit**: 100 req/60s per token (fixed-window, keyed on `tokenPrefix`). Exceeded → 429 `{ error, retryAfter }`. `src/lib/agent-rate-limit.ts`.

- `GET /api/agent/tasks` — list token-project tasks (paginated). Query (enum filters case-insensitive): `status`, `kind`, `priority` (invalid → 400), `assigneeEmail`, `search` (title/description substring), `tag` (tag name, case-insensitive), `page` (default 1), `limit` (default 50, max 200). Response: `{ count, page, limit, total, totalPages, tasks }` — `count` = rows on this page, `total` = all matching rows. Lean shape includes `tags[]`.
- `GET /api/agent/tasks/stats` — project-wide aggregate `{ total, byStatus:{open,inProgress,readyForQc,reopened,closed,total}, byPriority, byKind }`. `total` includes IDEA (byKind breaks it out — no `WORKLOAD_KIND_FILTER`, unlike admin-overview). Mounted before `/tasks/:id` so `/stats` is a static path.
- `GET /api/agent/tasks/:id` — rich task detail (404 if not in token project): scalars + full `comments` (author+body), `evidence` (url/note), `statusChanges` (history), `checklist` items with `id`+`title` (so an agent can PATCH/DELETE them), `tags`, dependencies `blockedBy`/`blocks` (linked task `id`/`title`/`status`/`kind`), computed `actualHours`/`progressPercent`, plus `retryCount` (READY_FOR_QC→REOPENED bounces) + `shouldEscalate` (retryCount ≥ 3).
- `GET /api/agent/project` — token-project metadata: scalars + `members` (with email, for `assigneeEmail`) + `phases` + `milestones` + `_count`.
- `POST /api/agent/tasks` (WRITE) — create. Body: `title`, `description` (both required), `kind?` (TASK|BUG|QC|TICKET — not IDEA; invalid → 400), `priority?` (invalid → 400), `assigneeEmail?`, `dueAt?`, `estimateHours?`.
- `PATCH /api/agent/tasks/:id` (WRITE) — update + status transition (validated against kind-aware state machine; writes `TaskStatusChange`; fires `notifyTaskStatusChanged`/`notifyTaskAssigned`). Accepts: `title`, `description`, `priority`, `status`, `kind` (not→IDEA), `route`, `startsAt`, `dueAt`, `estimateHours`, `progressPercent`, `assigneeEmail`, `tagIds` (replace set), `phaseId`. Invalid enum → 400; IDEA → 403. A `kind` change that would leave the task at a status the target kind can't hold (e.g. `READY_FOR_QC → TASK`) → 400 unless the same request also moves to a valid status (same kind↔status guard as the session route). Route lives in `task.update.route.ts`.
- `DELETE /api/agent/tasks/:id` (WRITE) — soft-delete (sets `deletedAt`). Task disappears from list/detail immediately. Audited.
- `POST /api/agent/tasks/:id/claim` (WRITE) — atomic transition OPEN/REOPENED → IN_PROGRESS. Uses `updateMany` with status guard to avoid TOCTOU race; returns 409 if task is not in a claimable status. Writes `TaskStatusChange`. IDEA → 403.
- `POST /api/agent/tasks/:id/evidence` (WRITE) — add link evidence. Body `{ url, note? }`. LINK kind only (no file upload on this surface). Audited.
- `POST /api/agent/tasks/:id/dependencies` (WRITE) — add dependency. Body `{ blockedById }`. Same-project check; BFS cycle detection → 400 on cycle; duplicate → 409.
- `DELETE /api/agent/tasks/:id/dependencies/:blockedById` (WRITE) — remove dependency (idempotent, no error if absent).
- `POST /api/agent/tasks/:id/comments` (WRITE) — body `{ body }`; comment tagged `AGENT` (read back via the detail route).
- `PATCH /api/agent/tasks/:id/comments/:commentId` (WRITE) — edit an AGENT-tagged comment (403 for non-AGENT comments — prevents token from altering human comments). Body `{ body }`; sets `editedAt`.
- `DELETE /api/agent/tasks/:id/comments/:commentId` (WRITE) — delete an AGENT-tagged comment (same gate as PATCH).
- `POST /api/agent/tasks/:id/checklist` (WRITE) — body `{ title }`. `PATCH/DELETE /api/agent/checklist/:itemId` (WRITE). All three audited (`AGENT_CHECKLIST_ADDED/UPDATED/DELETED`).
- `GET /api/agent/guide` — machine-readable guide (markdown/llmstxt.org format) to this surface with `curl` examples; base URL from request origin. **Auth-gated**: needs a `pmt_` token OR a logged-in session → else 401 (internal tool, not publicly discoverable). Lives under `/api/agent/*` rather than a public `llms.txt` on purpose.

Helpers: `src/lib/agent-auth.ts` (`resolveAgentAuth`, `resolveReporterId`, `canWrite`), `src/lib/agent-rate-limit.ts` (`checkAgentRateLimit` — Redis fixed-window 100/60s), `src/lib/task-enums.ts` (`isValidStatus/Kind/Priority` — shared validators), `src/routes/agent/shared.ts` (`deny`, `parseJson`, `LIST_INCLUDE`/`DETAIL_INCLUDE`, `enrich`, `ownedTask`, `resolveChecklistWrite`). Enforcement mirrors the MCP token-scoped server. `reporterId`/`authorId` fall back to project owner when the token's creator was deleted. A local CLI wrapper (`scripts/agent-cli.ts`, `bun run agent <cmd>`) reads `.env.agent` and drives this surface. Route modules: `tasks.route.ts` (reads), `writes.route.ts` (create + soft-delete), `task.update.route.ts` (PATCH), `comments.route.ts` (POST + PATCH + DELETE), `task.claim.route.ts`, `evidence.route.ts`, `dependencies.route.ts`, `checklist.route.ts`, `project.route.ts`, `index.ts` (barrel + rate limiter middleware).

## Admin API (SUPER_ADMIN only)

- `GET /api/admin/users` — list users with role, blocked status, createdAt. Optional query: `search` (substring over name/email, case-insensitive), `role` (USER|QC|ADMIN|SUPER_ADMIN; 400 on invalid). Pagination is opt-in: **without `limit`** returns the full roster as `{ users }` (legacy shape — used by OverviewPanel/AuditLogsPanel); **with `limit`** returns `{ users, total, limit, offset }` (`limit` clamped 1–200, `offset` default 0).
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

## Extensions

Toggle untuk fitur opt-in (GitHub Integration, Chat AI). Default semuanya aktif. Lihat `@docs/FEATURES.md` § Extensions.

- `GET /api/admin/extensions` (ADMIN + SUPER_ADMIN) — list extension + status. Response: `{ extensions: [{ key, label, description, enabled }] }`.
- `PUT /api/admin/extensions/:name` (ADMIN + SUPER_ADMIN) — body `{ enabled: boolean }`. Tulis `AuditLog` action `EXTENSION_TOGGLED` detail `{ name, enabled, source: 'api' }`. 400 untuk nama tak dikenal atau body non-boolean.
- `GET /api/extensions/status` (semua user authed) — `{ enabled: { github: boolean, chat: boolean } }`. Dipakai FE untuk gating UI.

Saat extension OFF:
- `/api/admin/chat/stream` & `/api/admin/chat/sync` → 503 `{ error: 'Extension disabled', extension: 'chat' }`.
- `/webhooks/github` → 200 `{ ok: true, skipped: true, reason: 'extension_disabled' }` (200 sengaja agar GitHub tidak auto-disable webhook).

## Chat AI

Admin Chat AI dengan live-context + RAG knowledge base. Lihat `@docs/CHAT-AI.md` untuk arsitektur, doc types, dan sync schedule.

- `POST /api/admin/chat/stream` — SSE stream. Body: `{ messages: ChatMessage[], systemContext?: string|null }`. Events: `phase` (`{ label }` — teks status human-readable yang dirender FE selama loading; loop ke Claude juga mengikutkan `phase`+`iter`. Label: iter 0 `"Menganalisis pertanyaan..."`, iter 1+ `"Memproses data & menyusun jawaban..."`, dan `"Mencari data..."` diemit saat tool mulai dieksekusi pada iterasi mana pun), `system` (kalau cachedContext null), `docs` (count relevan), `sources` (`[{ ref, type, entityId, title }]`), `tool_use` (`{ id, name, input }`), `tool_result` (`{ id, name, ok, result }`), `token`, `done` (full text + sources + toolCalls trace), `error`. AI dapat memanggil 5 tool read-only via Anthropic tool_use loop (max 5 iterasi); lihat `@docs/CHAT-AI.md` § Tool-calling layer.
- `GET /api/admin/chat/sync/status` — `{ totalDocuments, lastSync, breakdown }`.
- `POST /api/admin/chat/sync` — trigger full sync + orphan prune. Return `{ ok, synced, pruned, failedEmbeddings, duration }`.

## Report History

Riwayat pengiriman laporan harian disimpan di PostgreSQL (bukan Redis). Accessible oleh ADMIN + SUPER_ADMIN; delete hanya SUPER_ADMIN.

- `GET /api/admin/report/send-history?page=1&limit=20&range=1m|3m|all` — paginated history. `range` default `1m`. Response: `{ history, entries, total, page, limit, range }`. Setiap entry: `{ id, sentAt, ok, message, trigger, markdown?, createdAt }`.
- `DELETE /api/admin/report/history/:id` — hapus satu entri (SUPER_ADMIN only).

## Events (Team Reminders)

Team-wide events/reminders. All authenticated users can read and create. Only creator or admin can edit/delete.

- `GET /api/events` — list events ordered by startsAt asc. Filters: `upcoming=true` (only future events), `limit` (default 50, max 200), `offset`. Returns `{ count, events }` with `createdBy` and `project` joined.
- `POST /api/events` — create event. Body: `title` (required), `startsAt` (required ISO 8601), `endsAt?`, `description?`, `location?`, `projectId?` (optional link to a project).
- `PATCH /api/events/:id` — partial update (creator or ADMIN/SUPER_ADMIN). Accepts same fields as POST. `endsAt: null` to clear.
- `DELETE /api/events/:id` — permanent delete (creator or ADMIN/SUPER_ADMIN).

## Projects + Tasks

Projects and tasks are project-scoped; all write endpoints gate on `requireProjectMember`. Role hierarchy (inside a project): `OWNER > PM > MEMBER > VIEWER`. `SUPER_ADMIN` bypasses membership checks.

- `GET /api/projects` — list projects visible to current user (owned or member of); counts and task stats
- `POST /api/projects` — create (auto-adds creator as `OWNER`)
- `GET /api/projects/:id` — full detail (members, milestones, extensions, recent tasks) + `myRole`
- `PATCH /api/projects/:id` — update fields (OWNER/PM). Accepts `githubRepo` (normalized server-side, `null` to unlink; 409 on duplicate link)
- `DELETE /api/projects/:id` — permanent delete with cascade (OWNER or SUPER_ADMIN). Audited.
- Project members, milestones, extensions — usual CRUD under `/api/projects/:id/*`
- **Access Tokens** (OWNER/PM/admin only — `canManageProject` gate; `tokenHash` never returned):
  - `GET /api/projects/:id/access-tokens` — list tokens (id, name, tokenPrefix, scope, status, expiresAt, lastUsedAt, createdBy)
  - `POST /api/projects/:id/access-tokens` — create. Body `{ name, scope: READ|WRITE, expiresInDays? (7|30|90|365) }`. Returns `{ token, raw }` — **plaintext `raw` shown once**
  - `POST /api/projects/:id/access-tokens/:tokenId/revoke` — set status REVOKED
  - `DELETE /api/projects/:id/access-tokens/:tokenId` — permanent delete
- `GET/POST /api/projects/:id/tags` — list/create per-project tags; unique by (projectId, name)
- `PATCH/DELETE /api/tags/:id` — rename/recolor or delete (cascades to TaskTag)
- `GET /api/tasks` — list with filters (`projectId`, `status`, `kind`, `assigneeId`, `tagId`). `kind` ∈ `TASK | BUG | QC | TICKET | IDEA` (400 on invalid). Response enriches each task with `actualHours`, `progressPercent`, `tags`, counts for blockedBy/blocks/checklist.
- `POST /api/tasks` — create, accepts `startsAt`, `dueAt`, `estimateHours`, `tagIds[]`, `kind` (validated; defaults `TASK`)
- `GET /api/tasks/:id` — full detail incl. tags, blockedBy, blocks, checklist, statusChanges, comments, evidence + computed `actualHours`/`progressPercent`
- `PATCH /api/tasks/:id` — updates (status writes `TaskStatusChange`; status transitions are kind-aware — `IDEA` only allows `OPEN ↔ CLOSED`). Accepts `kind` (a change such as IDEA→TASK "promote" is recorded in the audit log as `kind:FROM→TO`), `tagIds` (replace set), `progressPercent`, `estimateHours`, dates. **Kind↔status guard**: a `kind` change is rejected 400 if the task's current status can't be held by the target kind's lifecycle (only real case: `READY_FOR_QC → TASK`, since TASK has no QC stage). Escape hatch: send a valid `status` in the same request (e.g. `{ kind: TASK, status: CLOSED }`) — the effective post-transition status is what's validated. Backed by `isStatusValidForKind` (`src/lib/route-helpers.ts`) and enforced identically across all four write surfaces: this endpoint, the Agent REST `PATCH /api/agent/tasks/:id`, the stdio MCP `task_update`, and the token-scoped HTTP MCP `task_update`.
- `DELETE /api/tasks/:id` — OWNER/PM/SUPER_ADMIN
- `POST /api/tasks/:id/comments`, `POST /api/tasks/:id/evidence` (+ `POST /api/tasks/:id/evidence/upload` multipart) — add-only
- `DELETE /api/tasks/:id/evidence/:evidenceId` — remove an evidence attachment (writable member or admin; VIEWER 403). Removes the file from MinIO (+ legacy on-disk copy). Audited `EVIDENCE_DELETED`.
- `GET /api/evidence/:file?task=<id>` — auth-gated proxy that streams the evidence file from MinIO (project members only). Falls back to legacy on-disk file for pre-migration evidence; 404 if absent, 502 if storage unreachable. See `@docs/ARCHITECTURE.md` § Evidence storage.
- `PATCH /api/tasks/:id/comments/:commentId` — edit a comment body (**author-or-admin**: only the comment's own author OR an ADMIN/SUPER_ADMIN; else 403). Requires project membership. Body required (400 if blank); sets `editedAt` so the UI shows a "(telah diedit)" marker. 404 if the comment isn't on the task.
- `DELETE /api/tasks/:id/comments/:commentId` — permanently delete a comment. Same **author-or-admin** gate as the PATCH. 404 if not found on the task.
- `POST /api/tasks/:id/dependencies` (body: `blockedById`) / `DELETE /api/tasks/:id/dependencies/:blockedById`
- `POST /api/tasks/:id/checklist`, `PATCH/DELETE /api/checklist/:id`

### Computed task fields (not stored)

- `actualHours` = `closedAt − (startsAt ?? createdAt)` in hours, rounded to 2dp. `null` until closed.
- `progressPercent`: 100 if `CLOSED`; else ratio of checklist.done / checklist.length if checklist non-empty; else manual `progressPercent` column value.
