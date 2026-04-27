Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Top-level layout

- `src/app.ts` — Elysia factory with all HTTP routes (testable via `app.handle()`)
- `src/index.tsx` — server entry (Vite middleware in dev, static serving in prod, `.listen()`)
- `src/serve.ts` — dev entry (`bun --watch src/serve.ts`)
- `src/frontend/` — React 19 + Vite 8 + TanStack Router (routes, components, hooks)
- `src/lib/` — single-purpose helpers: `db` (Prisma client), `redis`, `applog`, `presence`, `webhook-tokens`, `github`, `self-project`, `admin-overview`, `effort`, `retro`
- `prisma/` — `schema.prisma` + single baseline migration + `seed.ts` (dev only)
- `scripts/mcp/` — local stdio MCP (19 tool modules, 106 tools); `scripts/mcp-deploy/` — deploy wrapper
- `tests/unit/`, `tests/integration/` — `bun:test`

## Commands

- DB: `bun run db:migrate`, `bun run db:seed`, `bun run db:generate`
- Test: `bun run test`, `bun run test:unit`, `bun run test:integration`

## Detailed docs

Load the relevant file(s) when working in that area — Claude Code auto-loads `@docs/*.md`.

- @docs/ARCHITECTURE.md — Elysia server, auth, DB schema + Prisma, Redis, WebSocket, logging
- @docs/API.md — admin HTTP API + projects/tasks/tags endpoints (+ computed fields)
- @docs/FEATURES.md — admin overview cockpit, effort tracking, retrospectives
- @docs/INTEGRATIONS.md — pm-watch (`/webhooks/aw`) + GitHub (`/webhooks/github`)
- @docs/QC-TICKETS.md — QC self-project + `ai-queue` ticket flow
- @docs/FRONTEND.md — routes, components, role-based routing, dev tools, schema/structure visualization
- @docs/MCP.md — MCP server + tools (local stdio, HTTP fallback, remote-stg)
- @docs/DEPLOYMENT.md — Docker, compose, CI, deploy-stg MCP, preflight/version/migration gates
- @docs/TESTING.md — `bun:test` structure + helpers
