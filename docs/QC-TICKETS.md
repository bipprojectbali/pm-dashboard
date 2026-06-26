# QC Tickets (self-project)

QC is a dedicated app for filing bugs/tickets **against pm-dashboard itself**, not against every project the team manages. The feature keys off a single "self-project" flag; exactly one project is the self-project at a time, and all QC tickets live there tagged `ai-queue` so Claude can pick them up via the existing `ticket_queue` / `ticket_pick` flow (see `@docs/MCP.md`).

- **Schema**: `Project.isSelf Boolean @default(false)` (+ index). Only one row should be `true` at a time — enforced by the atomic swap in `setSelfProject()`, not a DB constraint.
- **Helper**: `src/lib/self-project.ts` — `getSelfProject()`, `setSelfProject(projectId)` (clears old + sets new + upserts `ai-queue` tag in a transaction), `clearSelfProject()`, `ensureAiQueueTag(projectId)`. Exports `AI_QUEUE_TAG = 'ai-queue'`.
- **Admin API** (SUPER_ADMIN only):
  - `GET /api/admin/self-project` — returns current self-project or `null`
  - `PUT /api/admin/self-project` body `{ projectId }` — atomic swap
  - `DELETE /api/admin/self-project` — clears
- **QC API** (QC + ADMIN + SUPER_ADMIN; bypasses project membership — QC role implicitly grants access to the self-project only):
  - `GET /api/qc/context` — `{ selfProject, canWrite, stats }` with status groupBy counts
  - `GET /api/qc/tickets?status=&priority=&q=&sort=&order=&page=&limit=` — list tickets in self-project tagged `ai-queue`. `q` = case-insensitive substring over title/description/route. `sort` ∈ `priority|created|updated|title`, `order` ∈ `asc|desc` (default sort: `priority` desc then `createdAt` desc). Paginated: `page` (1-based, default 1), `limit` (default 25, clamped 1–100). Response: `{ tickets, selfProject, page, limit, total, totalPages }`.
  - `POST /api/qc/tickets` — create (kind `BUG`, auto-tagged `ai-queue`, optional `evidenceUrls[]`)
  - `GET /api/qc/tickets/similar?title=&limit=` — trigram (`pg_trgm`) duplicate check over open `ai-queue` tickets in the self-project. `title` required (400 if blank). `similarity(title, $title) > 0.3`, `CLOSED` excluded, ordered by score desc, default limit 5 (max 20). Returns `{ possibleDuplicates: [{ id, title, status, priority, score }] }`. Read-only, never throws — `[]` if no self-project or `pg_trgm` unavailable. Helper: `src/lib/qc-duplicates.ts` `findSimilarTickets()`. (Route mounted before `:id` so `/similar` resolves as a static path.)
  - `GET /api/qc/tickets/:id` — full detail (reporter, assignee, tags, evidence, comments, checklist, statusChanges)
  - `PATCH /api/qc/tickets/:id` — update title/description/priority/status/route; writes `TaskStatusChange` on status change, and fires `notifyTaskStatusChanged` (see § Notifications)
  - `PATCH /api/qc/tickets/bulk` — apply the same `status`/`priority`/`assigneeId` to many tickets (`{ ids[], status?, priority?, assigneeId? }`, max 100). Only self-project `ai-queue` tickets match; others silently skipped. Status changes write `TaskStatusChange`; closing sets `closedAt`, reopening clears it. `assigneeId: null` unassigns. Atomic via `$transaction`. After the transaction, each status-changed ticket fires `notifyTaskStatusChanged` (see § Notifications). 400 if no ids or no field given; returns `{ ok, updated, statusChanges }`. (Route mounted before `:id` so `/bulk` resolves as a static path.)
  - `DELETE /api/qc/tickets/:id` — permanent delete (ADMIN + SUPER_ADMIN only; QC role can close but not delete). Cascades to comments/evidence/checklist/statusChanges/tag links.
  - `POST /api/qc/tickets/:id/comments` — `authorTag` stamped with the user's `role`
  - `POST /api/qc/tickets/:id/evidence` — body `{ url, note? }`, kind hard-coded to `LINK`
- **Frontend**: `/qc` route (`src/frontend/routes/qc.tsx`) — AppShell with stats card sidebar, SegmentedControl for status filter (open/in-progress/ready/closed/all), debounced search box (300ms; matches title/description/route), sortable column headers (Title/Priority/Tanggal — click to toggle asc/desc), ticket table with row checkboxes + select-all, multi-field **bulk action bar** (`qc/BulkActionBar.tsx`) shown when ≥1 ticket selected — status/priority Select for all QC roles, assignee Select for ADMIN/SUPER_ADMIN only (`/api/users`), "Terapkan" fires one atomic `PATCH /api/qc/tickets/bulk`, pagination (25/page; page state in `?page=`, resets to 1 on filter/search/sort change), create modal (title/description/priority/route/evidence URLs newline-separated) with a **non-blocking duplicate warning** — debounced title (300ms, ≥4 chars) queries `GET /api/qc/tickets/similar`; matches render a yellow `Alert` listing clickable existing tickets (open the drawer via `?ticketId=`) + status badge, submit stays enabled, and Drawer detail via `?ticketId=` search param. Filter/search/sort state persists in URL search params (`?status=&q=&sort=&order=`). Drawer supports inline edit mode (title/description/route via Edit → Simpan/Batal) and Delete button (ADMIN/SUPER_ADMIN only, confirm modal). Status + priority Select always-editable, evidence add form, comments thread + add, Timeline of status changes. `beforeLoad` gates: unauth → `/login`, blocked → `/blocked`, non-QC/ADMIN/SUPER_ADMIN → `/pm`.
- **Self-project picker UI**: `QcSelfProjectCard` at the top of `/admin?tab=projects` — shows current self-project with Ganti/Hapus buttons (both SUPER_ADMIN-only), empty state otherwise. Modal picks from the user's visible projects and saves via `PUT /api/admin/self-project`.

## Notifications

Every QC ticket status transition fires `notifyTaskStatusChanged` (`src/lib/notifications.ts`) so the pull-based Claude↔QC loop surfaces in the notification bell instead of being silent. Recipients are the ticket's **reporter and assignee**, minus the actor (`createNotification` skips when `actorId === recipientId`). Kind is `TASK_STATUS_CHANGED`. Fire-and-forget (`.catch(() => {})`) — a notification failure never blocks the status write.

Wired at three call sites, all firing **after** the `TaskStatusChange` row is written:
- `PATCH /api/qc/tickets/:id` (`src/routes/qc/write.route.ts`) — single transition.
- `PATCH /api/qc/tickets/bulk` (`src/routes/qc/bulk.route.ts`) — one notification per status-changed ticket; post-update assignee is used when the bulk payload also reassigns.
- MCP `ticket_submit` (`scripts/mcp/tools/tickets.ts`) — the primary Claude→QC handoff (`IN_PROGRESS → READY_FOR_QC`); actor is the resolved `authorEmail` user.

Ticket creation (`POST /api/qc/tickets`) sends no notification: under the reporter+assignee model the creator is the reporter and there is no assignee yet, so the only candidate recipient is the actor itself.
