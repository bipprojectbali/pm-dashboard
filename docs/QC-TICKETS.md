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
  - `GET /api/qc/tickets?status=&priority=` — list tickets in self-project tagged `ai-queue`
  - `POST /api/qc/tickets` — create (kind `BUG`, auto-tagged `ai-queue`, optional `evidenceUrls[]`)
  - `GET /api/qc/tickets/:id` — full detail (reporter, assignee, tags, evidence, comments, checklist, statusChanges)
  - `PATCH /api/qc/tickets/:id` — update title/description/priority/status/route; writes `TaskStatusChange` on status change
  - `DELETE /api/qc/tickets/:id` — permanent delete (ADMIN + SUPER_ADMIN only; QC role can close but not delete). Cascades to comments/evidence/checklist/statusChanges/tag links.
  - `POST /api/qc/tickets/:id/comments` — `authorTag` stamped with the user's `role`
  - `POST /api/qc/tickets/:id/evidence` — body `{ url, note? }`, kind hard-coded to `LINK`
- **Frontend**: `/qc` route (`src/frontend/routes/qc.tsx`) — AppShell with stats card sidebar, SegmentedControl for status filter (open/in-progress/ready/closed/all), ticket table, create modal (title/description/priority/route/evidence URLs newline-separated), and Drawer detail via `?ticketId=` search param. Drawer supports inline edit mode (title/description/route via Edit → Simpan/Batal) and Delete button (ADMIN/SUPER_ADMIN only, confirm modal). Status + priority Select always-editable, evidence add form, comments thread + add, Timeline of status changes. `beforeLoad` gates: unauth → `/login`, blocked → `/blocked`, non-QC/ADMIN/SUPER_ADMIN → `/pm`.
- **Self-project picker UI**: `QcSelfProjectCard` at the top of `/admin?tab=projects` — shows current self-project with Ganti/Hapus buttons (both SUPER_ADMIN-only), empty state otherwise. Modal picks from the user's visible projects and saves via `PUT /api/admin/self-project`.
