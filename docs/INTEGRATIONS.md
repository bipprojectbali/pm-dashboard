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
