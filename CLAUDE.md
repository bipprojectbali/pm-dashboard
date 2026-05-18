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

## Aturan penambahan fitur (WAJIB)

Setiap fitur baru — endpoint API, route frontend, lib helper, integrasi, behavior cron, dsb. — harus selalu disertai **dua hal** sebelum dianggap selesai:

1. **Test** di `tests/unit/` (untuk lib/helper murni) dan/atau `tests/integration/` (untuk endpoint via `app.handle()`). Minimal cover golden path + 1 edge case + 1 failure case. Gunakan helper di `tests/helpers.ts` (`createTestApp`, `seedTestUser`, `cleanupTestData`). Tidak boleh mock DB — tes integrasi harus hit Postgres asli (lihat `@docs/TESTING.md`).
2. **MCP tool** di `scripts/mcp/tools/` yang membungkus fitur tersebut sehingga bisa dipakai dari dev (stdio, full admin scope) DAN stg (HTTP, readonly otomatis karena `NODE_ENV=production` gate). Tool readonly daftarkan di module `*Readonly`, tool write di module utama. Update `@docs/MCP.md` saat menambah tool. Tujuannya: setiap fitur bisa diinspeksi/dijalankan tanpa harus login UI baik di dev maupun stg.

Pengecualian: perubahan kosmetik murni (rename label UI, tweak styling, copy-edit dokumentasi) tidak butuh test + MCP tool. Bila ragu apakah perubahan termasuk "fitur" — anggap iya, buat keduanya.

Saat menyelesaikan fitur tanpa test atau tanpa MCP tool, jelaskan secara eksplisit ke user kenapa dan minta konfirmasi sebelum dianggap done.

## Aturan update CLAUDE.md (WAJIB)

Setiap kali menyentuh **business logic** — definisi: perubahan yang mengubah behavior runtime, bukan hanya tampilan atau struktur file — CLAUDE.md (dan doc terkait di `@docs/*.md`) harus diperbarui **dalam PR/commit yang sama**, bukan sebagai follow-up terpisah.

Yang termasuk business logic dan wajib diikuti update docs:
- Alur autentikasi, otorisasi, atau role-check
- Kalkulasi atau agregasi data (effort, health score, retro, overview)
- Cron / scheduler / background job (kondisi trigger, TZ, cooldown, dedup)
- Integrasi eksternal (Telegram, GitHub webhook, Claude API, pm-watch)
- State machine (task status transition, agent status, token lifecycle)
- Aturan validasi atau constraint bisnis (batas batch, retention, scope MCP)
- Setting yang mengubah behavior server (`report.timezone`, `telegram.enabled`, dsb.)

Yang **tidak** termasuk dan tidak perlu update CLAUDE.md:
- Rename variable / refactor tanpa perubahan behavior
- Tweak styling, label UI, copy-edit teks
- Penambahan test atau MCP tool untuk fitur yang sudah terdokumentasi

Cara update: perbarui bagian yang relevan di `CLAUDE.md` dan/atau file `@docs/` terkait (ARCHITECTURE, API, FEATURES, INTEGRATIONS, dll). Jika tidak ada seksi yang pas, tambahkan seksi baru. Jangan buat file docs baru tanpa alasan kuat.

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
- @docs/FILE-HEALTH.md — file size limits, single-responsibility rules, when to split files
