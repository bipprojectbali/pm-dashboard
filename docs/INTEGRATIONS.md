# Webhook integrations

## pm-watch

ActivityWatch agents push events to `/webhooks/aw` → events land in `ActivityEvent` table, attributed to the user assigned to the `Agent`.

- **Webhook endpoint**: `POST /webhooks/aw` — accepts `{ agentId, hostname, osUser, events: [{ bucketId, eventId, timestamp, duration, data }] }`. Upserts agent on first contact (status `PENDING`). Rejects events until approved. Deduped via unique `(agentId, bucketId, eventId)`.
- **Batch cap**: `PMW_EVENT_BATCH_MAX` (default 500) — returns 413 on overflow
- **Auth**: DB-backed `WebhookToken` (SHA-256 hash). Falls back to `PMW_WEBHOOK_TOKEN` env var when no DB tokens are active. Revoked/expired/disabled tokens → 403 with reason.
- **Token lifecycle**: create → plaintext shown ONCE → store in agent config. Toggle ACTIVE/DISABLED anytime. Revoke is permanent.
- **Request logging**: every call (success or failure) writes a `WebhookRequestLog` row with `tokenId`, `agentId`, `statusCode`, `reason`, `eventsIn`. Retention `WEBHOOK_LOG_RETENTION_DAYS` (default 7), auto-cleanup on startup + every 24h.
- **Helpers**: `src/lib/webhook-tokens.ts` — `hashToken()`, `verifyToken()`, `generateToken()` (`whk_` prefix + random hex). Verify result includes `tokenId` on failure for attribution.

### Frontend pm-watch panels

- `src/frontend/components/AgentsPanel.tsx` — agent approval dashboard. Stats cards (pending/live/offline/events ingested), pending-approval alert banner, live-indicator dots (teal+pulse <5m, green <1h, gray stale, red revoked), inline Approve CTA on PENDING rows, approve modal with info card + user Select (confirm button disabled until user picked), revoke modal with consequences list, agent-ID tooltip + copy. Auto-refresh 15s.
- `src/frontend/components/WebhookTokensPanel.tsx` — token CRUD with show-once creation flow, expiry presets (never/7d/30d/90d/1yr).
- `src/frontend/components/WebhookMonitorPanel.tsx` — webhook activity monitor. 5 summary cards (requests/success+rate/failures/auth-fails/events over 24h), top tokens + top agents tables, recent-requests table with All/Success/Failures/Auth-fails filter. Auto-refresh 10s.

All three mount as `/dev` sidebar tabs (`Agents`, `Webhook Tokens`, `Webhook Monitor`).

## GitHub

Projects can be linked 1:1 to a GitHub repo via `Project.githubRepo` (stored canonical `owner/repo`). GitHub pushes/PRs/reviews flow in via webhook and are surfaced as project-level activity without requiring commit-message conventions.

- **Schema**:
  - `Project.githubRepo String? @unique` — normalized `owner/repo`, null until linked.
  - `ProjectGithubEvent` (id, projectId, kind, actorLogin, actorEmail?, matchedUserId?, title, url, sha?, prNumber?, metadata?, createdAt, ingestedAt). Unique on `(projectId, kind, sha, prNumber)` for dedup across webhook redeliveries.
  - `GithubWebhookLog` (id, projectId?, deliveryId?, event, statusCode, reason?, ip?, eventsIn, createdAt) — audit trail.
  - Enum `GithubEventKind = PUSH_COMMIT | PR_OPENED | PR_CLOSED | PR_MERGED | PR_REVIEWED`.
- **Webhook endpoint**: `POST /webhooks/github` — HMAC-SHA256 verified via `X-Hub-Signature-256` against `GITHUB_WEBHOOK_SECRET` (shared across all repos). `ping` → 200 pong. `push` → one `PUSH_COMMIT` per commit. `pull_request` → `PR_OPENED` / `PR_CLOSED` / `PR_MERGED` depending on action+merged. `pull_request_review` → `PR_REVIEWED`. 404 if repo not linked to any project. Returns `{ ok, event, received, inserted }`.
- **User attribution**: commit author `email` is matched to `User.email` → `ProjectGithubEvent.matchedUserId` populated on insert (batch query). Null otherwise.
- **Open PR derivation**: GitHub doesn't send "still open" events, so open PR count = set-difference of `PR_OPENED.prNumber` minus union of `PR_CLOSED.prNumber` + `PR_MERGED.prNumber`.
- **Helpers**: `src/lib/github.ts` — `normalizeGithubRepo(input)` (accepts https URL, git SSH, `owner/repo`, with/without `.git`), `verifyGithubSignature(rawBody, header, secret)` (timing-safe).
- **API**:
  - `PATCH /api/projects/:id` accepts `githubRepo` (normalized server-side). `null` to unlink. 409 on duplicate link to another project.
  - `GET /api/projects/:id/github/summary` — `{ linked, repo, stats: { commits7d, commits30d, contributors30d, openPrs, lastPushAt, lastPushBy }, contributors, openPrs, recent }`.
  - `GET /api/projects/:id/github/feed?limit=N&kind=X` — paginated events with `matchedUser` joined.
- **Frontend**:
  - Settings tab (`ProjectDetailView.tsx` → `GithubIntegrationCard`) — repo URL input with normalize preview, link/update/unlink buttons, webhook setup hint (endpoint URL + `Copy URL` + direct link to `Settings/hooks/new`).
  - Overview tab (`GithubActivityCard`) — 4 mini-stats (commits/7d, contributors/30d, open PRs, last push) + latest 10 events with per-kind badge colors. Empty state when repo not linked.

## Project Access Tokens

Per-user, project-scoped bearer tokens so coding agents (mis. Claude Code) bisa membaca/memperbarui data satu project — otomatis ter-scope tanpa perlu tahu `projectId`. Idenya: tiap project punya token; token menentukan project + identitas pembuat + izin (READ/WRITE).

- **Schema**: `ProjectAccessToken` (lihat `@docs/ARCHITECTURE.md`). Enum `ProjectTokenScope = READ | WRITE`, `ProjectTokenStatus = ACTIVE | REVOKED`.
- **Format token**: `pmt_<base64url(32 byte)>`. Hanya SHA-256 hash yang disimpan (`tokenHash @unique`) — plaintext tak bisa di-recover. `tokenPrefix` (12 char pertama) disimpan plaintext hanya untuk identifikasi di UI.
- **Helper**: `src/lib/project-access-tokens.ts` — `generateProjectToken()` (`{ raw, hash, prefix }`), `hashToken()` (SHA-256 hex), `verifyProjectToken(raw)` (resolve → `{ projectId, userId, scope }`, tolak revoked/expired, update `lastUsedAt`).
- **Lifecycle**: create → plaintext `raw` ditampilkan **sekali** → simpan di config agent. Hilang → buat token baru + revoke yang lama (tidak ada regenerate). Revoke permanen.
- **Gate**: buat/list/revoke/delete hanya OWNER/PM/admin (`canManageProject`). Token = kredensial, jadi list pun tidak dibuka ke MEMBER/VIEWER.
- **API**: lihat `@docs/API.md` § Access Tokens. **MCP**: `access_token_list` (readonly), `access_token_create`/`access_token_revoke` (admin) — lihat `@docs/MCP.md`.
- **Frontend**: `AccessTokensCard` di tab Settings project — create form (nama + scope + expiry preset), show-once modal dengan copy, tabel token + revoke/delete.

### HTTP MCP endpoint (Tahap 2a — aktif)

Agent coding (mis. Claude Code) connect ke `POST /mcp` dengan token `pmt_` → dapat MCP tool yang **otomatis ter-scope ke project token**. Tidak perlu kirim `projectId`.

- **Endpoint**: `POST /mcp` (+ `GET`/`DELETE` per spec MCP). Auth: `Authorization: Bearer pmt_…`. Header wajib client: `Accept: application/json, text/event-stream` + `Content-Type: application/json`. Token invalid/revoked/expired/hilang → **401**.
- **Transport**: `WebStandardStreamableHTTPServerTransport` (SDK MCP, Web-standard Request→Response), **stateless** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) — server + transport baru per request. Tidak perlu `initialize` sebelum `tools/call`.
- **Builder**: `scripts/mcp/token-scoped-server.ts` `buildTokenScopedServer(ctx)` — memanen tool task existing via capture-proxy lalu mendaftar hanya subset sesuai scope, strip `projectId` dari schema + inject dari token, enforce ownership lintas-project, blokir mutasi IDEA. **Tidak baca `NODE_ENV`** (beda dari stdio server) — WRITE digate murni `ctx.scope`.
- **Whitelist tool 2a**: READ → `task_list`, `task_get`. WRITE → + `task_create`, `task_update`, `task_transition`, `task_comment`, `task_checklist_add`/`update`/`delete`. IDEA read-only (create/update IDEA ditolak). **Tiket & task_delete/bulk/dependency ditunda ke Tahap 2b.**
- **Route**: `src/routes/mcp.route.ts` (di-`use` di `src/app.ts`). Beda dari stdio MCP server (`scripts/mcp/server.ts`, auth `MCP_SECRET` + scope by `NODE_ENV`) — dua surface independen.
- **Konfigurasi Claude Code** (`.mcp.json` di repo project):
  ```json
  { "mcpServers": { "pm-dashboard": {
    "type": "http",
    "url": "https://pm-dashboard.wibudev.com/mcp",
    "headers": { "Authorization": "Bearer pmt_…" }
  } } }
  ```

> **Belum di Tahap 2a:** alur tiket (`ticket_pick`/`ticket_submit`) — tool sudah ada di stdio, tinggal di-whitelist ke HTTP surface (Tahap 2b). **Keamanan:** pola `pmt_` sudah masuk scanner env-leak preflight (`scripts/mcp-deploy`) agar token tak ter-commit.
