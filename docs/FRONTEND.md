# Frontend

React 19 + Vite 8 (middleware mode in dev). File-based routing with TanStack Router.

- Entry: `src/frontend.tsx` — renders App, removes splash screen, DevInspector in dev
- App: `src/frontend/App.tsx` — MantineProvider (auto color scheme), ModalsProvider (`@mantine/modals`), QueryClientProvider, RouterProvider

## Routes

`src/frontend/routes/`:

- `__root.tsx` — Root layout (renders Outlet only, no floating UI)
- `index.tsx` — Landing page (theme toggle top-right)
- `login.tsx` — Login page (email/password + Google OAuth, theme toggle top-right)
- `dev.tsx` — Dev console with AppShell sidebar (SUPER_ADMIN only): Overview, Users, Agents, Webhook Tokens, Webhook Monitor, App Logs, User Logs, Database (React Flow ER diagram), Project (10 sub-views — all React Flow with auto-save)
- `admin.tsx` — Admin console (ADMIN + SUPER_ADMIN) — 9 tabs: overview, users, audit-logs, projects, tasks (triage), effort, analytics, sessions, health
- `qc.tsx` — QC ticket shell (QC + ADMIN + SUPER_ADMIN) — filters tickets in the self-project tagged `ai-queue`, with create modal and detail drawer
- `pm.tsx` — Project management shell (all authenticated users) — overview, projects, tasks, activity, team tabs
- `settings.tsx` — Profile/device/notification settings (all authenticated users)
- `dashboard.tsx` — Legacy redirect stub → `/admin`
- `profile.tsx` — Legacy redirect stub → `/settings`
- `blocked.tsx` — Blocked user page with explanation (theme toggle top-right)

## Components + hooks

`src/frontend/components/`:

- `ThemeToggle.tsx` — Shared dark/light mode toggle button (used across all pages)
- `NotFound.tsx` — 404 page
- `ErrorPage.tsx` — Error boundary page

Hooks:

- Auth: `src/frontend/hooks/useAuth.ts` — `useSession()`, `useLogin()`, `useLogout()`, `getDefaultRoute()`
- Presence: `src/frontend/hooks/usePresence.ts` — WebSocket auto-connect, exposes `onlineUserIds`

## UI conventions

- Mantine v8 + `@mantine/modals` (dark/light, auto default from device), react-icons, AppShell layout for dashboard pages
- Sidebar: Collapsible (260px expanded → 60px icon-only minimized with tooltips). State persisted in `localStorage`. Both dev and dashboard use same pattern.
- Logout: Confirm modal via `@mantine/modals` (`modals.openConfirmModal`) on dev, dashboard, and profile pages. Blocked page logs out directly (no confirm).
- Color scheme: `index.html` reads `localStorage` before first paint to prevent flash. Toggle integrated per-page (sidebar footer on AppShell pages, top-right on standalone pages). Persisted by Mantine in `localStorage`.

## Role-Based Routing

| Role | Default Route | Can Access |
|------|--------------|------------|
| SUPER_ADMIN | `/admin` | `/dev`, `/admin`, `/qc`, `/pm`, `/settings` |
| ADMIN | `/admin` | `/admin`, `/qc`, `/pm`, `/settings` |
| QC | `/qc` | `/qc`, `/settings` |
| USER | `/pm` | `/pm`, `/settings` |

- `getDefaultRoute(role)` in `src/frontend/hooks/useAuth.ts` — centralized redirect logic (SUPER_ADMIN/ADMIN → `/admin`; QC → `/qc`; USER → `/pm`)
- Legacy paths `/dashboard` and `/profile` exist as redirect stubs (→ `/admin` and `/settings` respectively)
- Blocked users are redirected to `/blocked` from all protected routes
- Tab state persisted in URL search params (`?tab=`) for `/dev`, `/admin`, and `/pm`

## Database Schema Visualization

- Dev Console Database tab renders an interactive ER diagram using `@xyflow/react` (React Flow)
- `GET /api/admin/schema` parses `prisma/schema.prisma` into models/fields/relations/enums JSON via `parseSchema()` in `src/app.ts`
- Custom node types: `ModelNode` (table fields with types/attributes) and `EnumNode` (enum values)
- Auto-save to `localStorage`: node positions (`dev:schema:positions`) and viewport/zoom (`dev:schema:viewport`) — debounced 500ms
- On reload, restores last positions and viewport. Falls back to grid layout + fitView if no saved state.

## Project Structure Visualization

Dev Console Project tab — 10 sub-views switchable via grouped Select dropdown:

- **Architecture group:**
  - **API Routes**: `GET /api/admin/routes` — all HTTP + WS + frontend routes with method/auth/category badges. Edges show login→redirect flow.
  - **File Structure**: `GET /api/admin/project-structure` — file nodes with import dependency edges. Filter by category. Double-click opens file in editor.
  - **User Flow**: Static — role-based navigation: landing → login → auth → blocked check → role check → destination.
  - **Data Flow**: Static — request lifecycle: client → Elysia → auth → handler → DB/Redis → response. WS + audit flows.
- **DevOps group:**
  - **Env Variables**: `GET /api/admin/env-map` — env vars with set/unset status, required/optional badges, edges to consuming files.
  - **Test Coverage**: `GET /api/admin/test-coverage` — source files (green/yellow/red coverage) with edges to test files. Filter by coverage status.
  - **Dependencies**: `GET /api/admin/dependencies` — NPM packages by category/type with edges to importing files.
  - **Migrations**: `GET /api/admin/migrations` — horizontal timeline of Prisma migrations with SQL preview and change type badges.
- **Live group:**
  - **Sessions**: `GET /api/admin/sessions` — active user sessions with online indicator, role mapping. Auto-refresh 10s.
  - **Live Requests**: Real-time API requests via WS broadcast. Hit counters, status color glow, avg response time. Pause/clear controls.

Each sub-view has independent auto-save (positions + viewport) via `useFlowAutoSave(key)` hook. All dynamic views have reload buttons. File nodes support double-click to open in editor. Request broadcast: `onAfterResponse` hook sends `{ type: 'request', method, path, status, duration }` to admin WS subscribers via `broadcastToAdmins()` in `src/lib/presence.ts`.

## Dev Tools

- Click-to-source: `Ctrl+Shift+Cmd+C` toggles inspector. Custom Vite plugin (`inspectorPlugin` in `src/vite.ts`) injects `data-inspector-*` attributes. Reads original file from disk for accurate line numbers.
- HMR: Vite 8 with `@vitejs/plugin-react` v6. `dedupeRefreshPlugin` fixes double React Refresh injection.
- Editor: `REACT_EDITOR` env var. `zed` and `subl` use `file:line:col`, others use `--goto file:line:col`.
