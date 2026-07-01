# Architecture

Elysia.js on Bun. React 19 + Vite 8 frontend. PostgreSQL via Prisma v6. Redis via `Bun.RedisClient`. Session cookie auth stored in DB.

## Server

- `src/app.ts` — Elysia app factory with all API routes (auth, admin, logs, presence, hello, health, Google OAuth). Testable via `app.handle(request)`.
- `src/index.tsx` — Server entry. Adds Vite middleware (dev) or static file serving (prod), click-to-source editor integration, audit log rotation, and `.listen({ port, idleTimeout: 255 })`. `idleTimeout` is set to the Bun max (255s) because endpoints that wait on the Claude API (`/api/admin/report/send-now`, `/api/admin/report/preview/stream`, `/api/admin/report/send-custom`) can stay idle for 30–120s while the LLM thinks; Bun's default 10s would close the socket mid-call and the browser sees a 502.
- `src/serve.ts` — Dev entry (`bun --watch src/serve.ts`). Dynamic import workaround for Bun EADDRINUSE race.

## Database

PostgreSQL via Prisma v6. Client generated to `./generated/prisma` (gitignored).

- Schema: `prisma/schema.prisma`
  - `User` (id, name, email, password, role, blocked, timestamps)
  - `Session` (id, token, userId, expiresAt)
  - `AuditLog` (id, userId, action, detail, ip, createdAt)
  - `Agent` (id, agentId, hostname, osUser, status, claimedById, lastSeenAt, timestamps) — pm-watch ActivityWatch ingestion agent
  - `ActivityEvent` (id, agentId, bucketId, eventId, timestamp, duration, data, createdAt) — raw AW events, unique per (agentId, bucketId, eventId)
  - `WebhookToken` (id, name, tokenHash, tokenPrefix, status, expiresAt, lastUsedAt, createdById, timestamps) — DB-backed webhook auth tokens
  - `WebhookRequestLog` (id, tokenId?, agentId?, statusCode, reason, ip, eventsIn, createdAt) — audit trail for `/webhooks/aw`
  - `Project` (id, name, description, ownerId, status, priority, startsAt, endsAt, originalEndAt, archivedAt, githubRepo?, isSelf, timestamps) — `githubRepo` unique, normalized `owner/repo`; `isSelf` marks the one QC "self-project" (see `@docs/QC-TICKETS.md`)
  - `ProjectGithubEvent` (id, projectId, kind, actorLogin, actorEmail?, matchedUserId?, title, url, sha?, prNumber?, metadata?, createdAt, ingestedAt) — unique per (projectId, kind, sha, prNumber)
  - `GithubWebhookLog` (id, projectId?, deliveryId?, event, statusCode, reason?, ip?, eventsIn, createdAt) — audit trail for `/webhooks/github`
  - `ProjectMember` (projectId, userId, role) — unique per (projectId, userId)
  - `ProjectMilestone`, `ProjectExtension` — planning + audited deadline pushes
  - `ProjectAccessToken` (id, projectId, createdById?, name, tokenHash @unique, tokenPrefix, scope, status, expiresAt?, lastUsedAt?, timestamps) — per-user, project-scoped bearer token for coding agents. `tokenHash` = SHA-256 of raw `pmt_…` token (plaintext never stored); `tokenPrefix` for UI display. Enums `ProjectTokenScope` = `READ | WRITE`, `ProjectTokenStatus` = `ACTIVE | REVOKED`. See `@docs/INTEGRATIONS.md` § Project Access Tokens. **Auth resolution is Tahap 2 — Tahap 1 only manages the token lifecycle.**
  - `ProjectPhase` (id, projectId, title, description?, summary?, status=PhaseStatus, order, startsAt?, endsAt?, timestamps) — fase/sprint per project; `summary` diisi saat menutup fase (ACTIVE→COMPLETED). Tasks link via nullable FK `phaseId` with `onDelete: SetNull`. Enum `PhaseStatus` = `PLANNING | ACTIVE | COMPLETED`.
  - `Task` (id, projectId, kind, title, description, status, priority, route?, reporterId, assigneeId?, startsAt?, dueAt?, estimateHours?, progressPercent?, closedAt?, timestamps) — plus 6 nullable QC structured bug-report columns `stepsToReproduce?`, `expected?`, `actual?`, `environment?`, `browser?`, `appVersion?` populated only by QC tickets filed via the structured create form (legacy/free-text tickets leave them null); see `@docs/QC-TICKETS.md`
  - `Tag` (id, projectId, name, color) — unique per (projectId, name)
  - `TaskTag` — m2m between Task and Tag
  - `TaskDependency` (id, taskId, blockedById) — self-relation on Task via named relations `TaskDependents`/`TaskBlockers`; unique per (taskId, blockedById)
  - `TaskChecklistItem` (id, taskId, title, done, order, timestamps)
  - `TaskStatusChange` (id, taskId, authorId?, fromStatus, toStatus, createdAt) — written by PATCH /api/tasks/:id whenever status changes, used by activity timeline
  - `Event` (id, title, description?, startsAt, endsAt?, location?, projectId?, createdById?, timestamps) — team-wide shared events/reminders; anyone can create, only creator or admin can edit/delete
  - `TaskComment` (id, taskId, authorId?, authorTag, body, createdAt, editedAt?), `TaskEvidence` — comments + attachments on tasks. `editedAt` is null until a comment is edited; set on edit so the UI shows a "telah diedit" marker.
- Enums: `Role` = `USER | QC | ADMIN | SUPER_ADMIN` (default `USER`); `TaskKind` = `TASK | BUG | QC | TICKET | IDEA`; `TaskStatus` = `OPEN | IN_PROGRESS | READY_FOR_QC | REOPENED | CLOSED`; `TaskPriority` = `LOW | MEDIUM | HIGH | CRITICAL`; `AgentStatus` = `PENDING | APPROVED | REVOKED`; `WebhookTokenStatus` = `ACTIVE | DISABLED | REVOKED`; `GithubEventKind` = `PUSH_COMMIT | PR_OPENED | PR_CLOSED | PR_MERGED | PR_REVIEWED`
  - `TaskKind` semantics: `TASK`/`BUG`/`QC` follow the full lifecycle. `TICKET` = cross-project intake request, same lifecycle as BUG, **counts as real work** in all metrics. `IDEA` = backlog capture ("biar tidak lupa") restricted to `OPEN ↔ CLOSED` only (no IN_PROGRESS/READY_FOR_QC/REOPENED); promotion to actionable work is done by changing `kind` IDEA→TASK (recorded in the audit log). `IDEA` is **excluded from every workload metric** (health/load/risk/analytics/effort/retro) via `WORKLOAD_KIND_FILTER` in `src/lib/task-metrics.ts` so un-triaged ideas don't pollute dashboards.
- Client singleton: `src/lib/db.ts` — import `{ prisma }` from here
- Seed: `prisma/seed.ts` — demo users (superadmin, admin, user) with `Bun.password.hash` bcrypt. **Seed runs local/dev only** — the prod/stg migrate sidecar in `compose.yml` runs `bun prisma migrate deploy` without seeding. Seed's `wipe()` truncates tables, so never wire it into deploy flow.
- Migrations: single baseline `prisma/migrations/20260420014347_baseline/` represents the full schema. Earlier incremental migrations were collapsed to avoid drift; prod was marked `--applied` against this baseline.
- Commands: `bun run db:migrate`, `bun run db:seed`, `bun run db:generate`

## Redis

Bun native `Bun.RedisClient` — no external package needed.

- Client singleton: `src/lib/redis.ts` — connects to `REDIS_URL`
- App logs: stored as Redis List (`app:logs`), max 500 entries via `LTRIM`, persists across restart
- App log module: `src/lib/applog.ts` — `appLog(level, message, detail?)`, `getAppLogs(options?)`, `clearAppLogs()`

## Auth

Session-based auth with HttpOnly cookies stored in DB.

- Login: `POST /api/auth/login` — finds user by email, verifies password with `Bun.password.verify`, checks blocked status, creates Session record. Logs to audit trail.
- Google OAuth: `GET /api/auth/google` → Google → `GET /api/auth/callback/google` — upserts user, creates session. Redirect URI is built via `getPublicOrigin(request)` which honors `BETTER_AUTH_URL`, then `X-Forwarded-Proto`/`X-Forwarded-Host` (behind Traefik TLS termination), falling back to `request.url`. Prevents `redirect_uri_mismatch` when the app sits behind a reverse proxy.
- Session: `GET /api/auth/session` — looks up session by cookie token, returns user (including role & blocked) or 401, auto-deletes expired
- Logout: `POST /api/auth/logout` — deletes session from DB, clears cookie
- Blocked users: login returns 403, existing sessions are invalidated on block, frontend redirects to `/blocked`

## Agent surfaces (token-authed)

Two ways a per-project `pmt_` access token lets a coding agent reach one project's data:

- `POST /mcp` (+ `GET`/`DELETE`) — token-scoped MCP surface. Auth via `pmt_` token (not session, not `MCP_SECRET`). SDK `WebStandardStreamableHTTPServerTransport`, **stateless** (fresh `McpServer` + transport per request). `src/routes/mcp.route.ts` + `scripts/mcp/token-scoped-server.ts`. For interactive Claude Code.
- `/api/agent/*` + `GET /llms-agent.txt` — token-only REST surface (lighter than MCP) for CLI/scripts. `src/routes/agent.route.ts` + `src/lib/agent-auth.ts`; **auth-gated** guide at `/llms-agent.txt` (`src/lib/llms-content.ts`) — requires a `pmt_` token OR a logged-in session (not public; internal tool). Isolated from session routes.

Both use the same token; see `@docs/INTEGRATIONS.md` and `@docs/API.md` § Agent REST API. Distinct from the stdio MCP server.

## WebSocket

- `WS /ws/presence` — real-time user presence. Authenticates via session cookie. Tracks connections in-memory (`src/lib/presence.ts`). Broadcasts online user list to admin subscribers on connect/disconnect.

## Logging

Three log systems:

- **App Logs** (`src/lib/applog.ts`) — Redis-backed ring buffer (500 entries). Logs API requests (via `onAfterResponse` hook), errors, auth events. Auto-rotates via `LTRIM`. Can be cleared manually.
- **Audit Logs** (DB `AuditLog` table) — Persistent user activity trail. Actions: `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `ROLE_CHANGED`, `BLOCKED`, `UNBLOCKED`. Auto-cleanup of records older than `AUDIT_LOG_RETENTION_DAYS` (default 90) runs on startup + every 24h. Can be cleared manually.
- **Webhook Request Logs** (DB `WebhookRequestLog` table) — Audit trail for `/webhooks/aw`. Every request logs `tokenId`, `agentId`, `statusCode`, `reason`, `eventsIn`, `ip`. Auto-cleanup of records older than `WEBHOOK_LOG_RETENTION_DAYS` (default 7) on startup + every 24h.
- **Pagination** — Dev Console App Logs and User Logs use client-side pagination (25 per page). Avoids rendering hundreds of rows while polling every 5s. Page resets on filter change.

## Bun APIs used

- `Bun.password.hash()` / `Bun.password.verify()` for bcrypt
- `Bun.RedisClient` for Redis (native, no package)
- `Bun.file()` for static file serving in production
- `Bun.which()` / `Bun.spawn()` for editor integration
- `crypto.randomUUID()` for session tokens
