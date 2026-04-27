# Portfolio features

Admin-facing aggregates. Each lib is the single source of truth — MCP tools and HTTP endpoints both delegate to it so UI and MCP stay in sync.

## Admin Overview Cockpit

System-wide "what needs attention right now" dashboard at `/admin?tab=overview`. Answers: is anything on fire? which projects are failing? who's overloaded?

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
