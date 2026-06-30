# Portfolio features

Admin-facing aggregates. Each lib is the single source of truth — MCP tools and HTTP endpoints both delegate to it so UI and MCP stay in sync.

## Admin Overview Cockpit

System-wide "what needs attention right now" dashboard at `/admin?tab=overview`. Answers: is anything on fire? which projects are failing? who's overloaded?

> **Kind exclusion:** all task aggregations below (health/load/risk/analytics + effort/retro/chat) filter out `kind = IDEA` via `WORKLOAD_KIND_FILTER` (`src/lib/task-metrics.ts`). Ideas are backlog captures, not committed work, so they never count toward overdue/stale/load/health. `TICKET` **is** counted (real work).

- **Helpers**: `src/lib/admin-overview.ts`
  - `computeAdminOverview({ recentAuditLimit? })` — aggregated KPIs (users/projects/tasks/agents/webhooks24h/velocity/recentAudit). Mirrors `/admin` top cards.
  - `computeProjectHealth({ projectId?, includeArchived?, limit? })` — per-project score 0-100 + grade A-F derived from pastDue (-35), overdueTasks (-5 each capped 25), blockedTasks (-3 each capped 15), extensions>2 (-10), extensions>4 (-5), no velocity on ACTIVE project (-10). Sorted worst-first.
  - `computeTeamLoad({ projectId?, includeUnassigned?, limit? })` — per-user `open`, `estimateHours`, `highPriority`, `overdue`, `closed7d`; `overloaded = open >= 10 || estimateHours > 80 || overdue >= 3`. Sorted by open desc.
  - `computeRiskReport({ staleDays?, offlineHours? })` — consolidated scan: overdueTasks, staleTasks (IN_PROGRESS not updated in N days), pastDueProjects, pendingAgents, offlineAgents, missingEnv (DATABASE_URL/REDIS_URL/GOOGLE_*). Severity rollup: `high` (pastDueProjects > 0 OR missingEnv > 0), `medium` (>5 overdueTasks OR >5 staleTasks), `low` (any overdue/stale/offline/pending agent), else `none`.
  - `computeAnalytics({ timelineLimit?, trendDays? })` — chart-ready aggregates: `projectsByStatus`, `tasksByStatus`, `timeline` (active projects with startsAt/endsAt/slipped flag), `deadlineGroups` (pastDue / endingSoon <7d / endingMonth 7–30d), `taskTrend` (created vs closed per day, last N days, default 14, max 60).
- **API** (ADMIN + SUPER_ADMIN):
  - `GET /api/admin/overview/kpis?recentAuditLimit=N`
  - `GET /api/admin/overview/health?projectId&includeArchived&limit`
  - `GET /api/admin/overview/load?projectId&includeUnassigned&limit`
  - `GET /api/admin/overview/risks?staleDays&offlineHours`
  - `GET /api/admin/overview/analytics?timelineLimit&trendDays`
- **Frontend**: `OverviewPanel.tsx` — KPI cards (skeleton-loading) + Red flags (severity badge + 6 risk stats + overdue top-5 + past-due projects list) + Portfolio health grid (card per project with A-F badge, clickable) + Team load bars (Progress per user colored by overloaded-threshold) + **AnalyticsSection** (Gantt-style project timeline with today marker, status-breakdown donuts for projects+tasks, task-trend line chart with Created/Closed series, deadline-groups 3-column list) — all via ECharts (`src/frontend/components/charts/EChart.tsx` wrapper). Red flags refresh 30s; health + load + analytics refresh 60s. Empty states shown when no data.

## Effort Tracking

Evidence-based effort attribution: correlates pm-watch `ActivityEvent` rows (ActivityWatch window-bucket events) with `Task.startsAt` / `closedAt` windows to compute "actualHours" per task. An event belongs to an `Agent`; `Agent.claimedById` identifies the user; a task's actual hours is the sum of window-bucket event durations from that user's agents that fall inside the task's active period.

- **Helpers**: `src/lib/effort.ts`
  - `computeTaskEffort(taskId)` — single task, returns `{ actualHours, estimateHours, variancePercent, verdict, eventCount, windowStart, windowEnd }`
  - `effortReport({ projectId?, onlyClosed?, limit? })` — batched report across many tasks
  - `detectGhostTasks({ staleDays?, limit? })` — IN_PROGRESS tasks not moved in N days; augmented with `assigneeOnlineLast24h` (did the assignee's agents produce any activity in last 24h?) and `actualHoursLast7d`
  - `computePhantomWork({ days?, limit? })` — per-user breakdown: `totalHours` (window-bucket events), `trackedHours` (events covered by at least one of that user's IN_PROGRESS or recently-closed tasks), `phantomHours = total − tracked`, `phantomPercent`
- **Verdict categories**: `under` (>25% below estimate), `on` (within ±25%), `over` (>25% above), `missing-estimate`, `no-assignee`, `no-activity`
- **API** (ADMIN + SUPER_ADMIN):
  - `GET /api/admin/effort?projectId&onlyClosed&limit` — variance report
  - `GET /api/admin/effort/task/:id` — single task detail
  - `GET /api/admin/effort/ghost?staleDays&limit`
  - `GET /api/admin/effort/phantom?days&limit`
- **Frontend**: `/admin?tab=effort` → `EffortPanel` with 3 sub-views via SegmentedControl: Variance (5 summary cards + task table with variance %), Ghost tasks (stalled vs abandoned signal), Phantom work (per-user untracked %).
- **Bucket filter**: events are filtered by `bucketId` containing `"window"` (i.e. `aw-watcher-window_*`). AFK-bucket events are ignored. Duration is AW-native seconds.

## Retrospectives

Automated per-project retrospective generator. Given a project and a time window, produces a structured snapshot (shipped, slipped, biggest misses, still blocked, deadline pushes, GitHub activity, top contributors) plus a renderable markdown draft a PM can paste into a doc or read aloud in standup.

- **Helpers**: `src/lib/retro.ts`
  - `computeRetro({ projectId, since, until? })` — returns `RetroResult | null`. Runs 7 parallel Prisma queries (closed, dueAt-in-window, still-blocked, new-tasks count, extensions, GitHub groupBy `kind`, CLOSED status-changes) + one groupBy on `ProjectGithubEvent` by `(matchedUserId, kind)` for contributor attribution. Slipped = `!closedAt || closedAt > dueAt`. Biggest misses = top 5 by `daysOverDue`.
  - `renderRetroMarkdown(retro)` — formats to markdown with TL;DR, Shipped, Slipped, Biggest misses, Still blocked, Deadline pushes, Top contributors sections.
- **API** (project member OR ADMIN/SUPER_ADMIN):
  - `GET /api/projects/:id/retro` — JSON result. `since`/`until` query params (ISO); defaults to last 14 days. 400 on invalid dates. 404 on unknown project. 403 for non-member non-admin.
  - `GET /api/projects/:id/retro?format=md` — renders markdown with `text/markdown` content-type.
- **Frontend**: Project detail **Retro tab** (`ProjectDetailView.tsx` → `RetroTab.tsx`). SegmentedControl over 7d/14d/30d/90d windows. 6 summary cards (Shipped / Slipped / Still blocked / New tasks / Extensions / Commits) + GitHub activity card (conditional) + sections for each list + Top contributors card. "Copy markdown" via `<CopyButton>`, "Download .md" via Blob URL. Markdown fetched lazily via separate `useQuery` (`enabled: !!data`).

## Chat AI Knowledge Base

Admin Chat AI di `/admin?tab=chat` menjawab pertanyaan operasional dari DB. Dua lapisan pengetahuan: **live context** (snapshot KPI/roster/effort/github 7h yang dibangun saat pesan pertama, di-cache di state FE) dan **RAG knowledge base** (`chat_document` table, di-sync periodik). Jawaban menyertakan citation `[#n]` yang merujuk dokumen sumber. Detail lengkap di `@docs/CHAT-AI.md`.

- **Helpers**: `src/lib/chat.ts` (`buildChatContext`, `retrieveRelevantDocs`, `streamChatSSE`), `src/lib/chat-documents.ts` (`syncChatDocuments`, `searchDocuments`, `extractKeywords`, `pruneOrphanDocs`), `src/lib/chat-tools.ts` (`CHAT_TOOLS`, `executeChatTool` — 5 read-only tool query), `src/lib/github-summary.ts` (`computeProjectGithubSummary`).
- **Tool-calling layer**: Anthropic native tool_use loop (max 5 iterasi). 5 tool: `query_users`, `query_tasks` (list/aggregate), `query_project_detail`, `query_github_activity`, `query_effort`. Hasil cap 50 row, validasi Zod. System prompt mewajibkan tool untuk pertanyaan numerik/agregat dan entitas spesifik. SSE event `tool_use` + `tool_result` di-render FE sebagai `ToolCallCard` collapsible. Lihat `@docs/CHAT-AI.md` § Tool-calling layer.
- **Doc types** (`chat_document.type`): `user`, `task`, `project`, `event`, `comment`, `github_project`, `effort_user`, `effort_task`, `ghost_task`, `milestone`, `extension`, `dependency`, `evidence`, `audit_recent`, `agent_status`, `report_history`, `project_retro`. Unique per `(type, entityId)`. `project_retro` hanya di full-sync (mahal).
- **Sync schedule**: startup full-sync (include prune); cron `*/10 * * * *` incremental; tombol "Perbarui Pengetahuan" di FE → full-sync via `POST /api/admin/chat/sync`.
- **Search**: pgvector semantic (cosine threshold 0.35) → FTS fallback (`extractKeywords` + `to_tsvector('simple')`) → trigram fuzzy untuk proper noun. Merge unik by id, return `{ hits, formatted }` dengan ref `[#1]…[#N]`.
- **Citation flow**: system prompt menginstruksikan AI gunakan tag `[#N]`; SSE event `sources` (`[{ ref, type, entityId, title }]`) dikirim sebelum `token` pertama dan diulang di `done`. FE render footer badge per assistant bubble.
- **API** (ADMIN + SUPER_ADMIN): lihat `@docs/API.md` § Chat AI.
- **Frontend**: `AdminChatPanel.tsx` — header dengan badge "Konteks {age}" + "{n} dok" + "+synced/−pruned" pasca sync. Tombol "Refresh Konteks" (kosongkan systemContext tanpa hapus history), "Perbarui Pengetahuan" (full sync), "Sesi Baru" (reset). Quick prompts: top-risk, top-committer, overbudget, overloaded, overdue, events.
- **Session persistence**: percakapan (`messages` + `systemContext` + `contextLoadedAt`) di-persist ke `sessionStorage` (key `admin:chat:session`) via `AdminChatPanel/chat-session-storage.ts`, jadi pindah tab di `/admin` lalu balik ke Chat AI tidak menghilangkan history (tab Chat conditional-render → unmount `useChatStream`). Bertahan selama tab browser terbuka; reset saat tab ditutup atau klik "Sesi Baru" (`resetSession` memanggil `clearChatSession`). `contextLoadedAt` disimpan sebagai ISO string, di-rehydrate ke `Date`.

## Extensions (opt-in features)

Beberapa fitur diperlakukan sebagai **extension** — bagian dari aplikasi tapi bisa di-toggle off tanpa kehilangan data, untuk deployment yang tidak butuh fitur tersebut. Saat ini ada dua: **GitHub Integration** dan **Chat AI**. Default keduanya **aktif**.

- **Setting key**: `extensions.<name>.enabled` di tabel `app_settings`. Hanya nilai literal `'false'` yang menonaktifkan; tidak ada row / nilai apa pun lain = aktif (default-on).
- **Helper**: `src/lib/extensions.ts`
  - `EXTENSION_KEYS = ['github', 'chat'] as const` — registry type-safe.
  - `EXTENSION_META[key] = { label, description }` — untuk UI.
  - `isExtensionEnabled(key)` — cached 60s (modul-level Map).
  - `isExtensionEnabledFresh(key)` — bypass cache (untuk test / verifikasi).
  - `getAllExtensions()` — `{ github: boolean, chat: boolean }`.
  - `invalidateExtensionCache()` — dipanggil otomatis oleh `setSetting('extensions.*', ...)` lewat hook di `src/lib/app-settings.ts`.
  - `isValidExtensionKey(s)` — type guard.
- **Gating 4-lapis** saat extension OFF:
  1. **API** — endpoint terkait balas error/skip. Chat: `/api/admin/chat/stream` & `/api/admin/chat/sync` → 503 `{ error: 'Extension disabled', extension: 'chat' }`. GitHub webhook: `/webhooks/github` → **200** `{ ok: true, skipped: true, reason: 'extension_disabled' }` (200 sengaja agar GitHub tidak auto-disable webhook setelah 100× failure; log `WebhookGithubLog` tetap dengan reason `extension_disabled`).
  2. **Background work** — `syncChatDocuments` skip di startup boot (`src/index.tsx`) dan cron `*/10 * * * *` saat Chat OFF. Doc type `github_project` di `syncChatDocuments` skip query saat GitHub OFF.
  3. **Cross-extension awareness** — Chat AI tool `query_github_activity` di-filter keluar dari `CHAT_TOOLS` di `streamChatSSE` saat GitHub OFF (anti halusinasi).
  4. **UI** — tab "Chat AI" di `/admin` disembunyikan, `GithubActivityCard` di project overview dan `GithubIntegrationCard` di project settings disembunyikan. Hook FE `useIsExtensionEnabled(key)` default `true` saat data masih loading agar tidak flicker hidden → visible.
- **Toggle UI**: `/dev?tab=ext-github` & `/dev?tab=ext-chat` (grup "Extensions" di sidebar) → `ExtensionTogglePanel`. SUPER_ADMIN only.
- **Audit**: setiap toggle tulis `AuditLog` action `EXTENSION_TOGGLED` detail `{ name, enabled, source }` (source: `'api'` dari HTTP, `'mcp'` dari MCP tool).
- **Data preservation**: OFF tidak menghapus apa pun — `chat_document` & `ProjectGithubEvent` rows tetap; saat di-ON lagi data lama bisa langsung diakses (sync cron akan rotate).
- **API**: lihat `@docs/API.md` § Extensions.
- **MCP**: lihat `@docs/MCP.md` § Extensions.
