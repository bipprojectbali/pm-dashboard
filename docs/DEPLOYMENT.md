# Deployment

Container image → GHCR → Portainer stack → Traefik TLS. Two-step flow driven by GitHub Actions, wrapped in the `deploy-stg` MCP server for hands-off ops.

## Build + stack

- **Dockerfile** — multi-stage `oven/bun:1` build: `deps` (install) → `prisma` (client generate) → `builder` (Vite build) → `runner` (copies `node_modules`, `generated/`, `prisma/`, `scripts/`, `src/`, `dist/`, `package.json`). Sets `NODE_ENV=production`, accepts build args `GIT_COMMIT` + `BUILT_AT` and sets them as env so `/api/version` can report them. Exposes `3000`, runs `bun src/index.tsx`. Runner **must** include `generated/` and `scripts/` — prior builds missed them and crashed on `require('../../generated/prisma')`.
- **.dockerignore** — excludes `node_modules`, `dist`, `generated`, `.git`, `.env*` (allows `.env.example`), tests, IDE junk, `compose.yml`, `Dockerfile`, docs.
- **compose.yml** (stg stack) — two services:
  - `pm-dashboard` — app container, `restart: unless-stopped`, networks: `public-net` (Traefik) + `postgres-net-stg` + `redis-net`. Traefik labels: `Host('pm-dashboard.wibudev.com')`, entrypoint `websecure`, TLS via `letsencrypt` certresolver, routes to container port 3000.
  - `migrate` — one-shot sidecar, `restart: "no"`, `entrypoint: bun prisma migrate deploy`. Uses `DIRECT_URL` (bypass PgBouncer) for migrations. **No seed** — seed belongs to local dev only.

## GitHub Actions (`.github/workflows/`)

- `publish.yml` — `workflow_dispatch` with `stack_env` (dev/stg/prod) and `tag`. Builds `linux/amd64` with Buildx, passes `GIT_COMMIT=<github.sha>` + `BUILT_AT=<ISO-8601 UTC>` as build args, pushes to GHCR as `ghcr.io/<repo>:<env>-<tag>` + `<env>-latest`. Checks out branch matching `stack_env`.
- `re-pull.yml` — `workflow_dispatch` with `stack_name` + `stack_env`. Calls Portainer API (`PORTAINER_*` secrets) to redeploy the stack against `<stack_name>-<stack_env>`. Migrate sidecar runs first; app container restarts on new image. One-shot sidecar showing `Exited (0)` is normal — Portainer's "failure" label on it is a false positive.
- `check-migrations.yml` — migration drift guard on push/PR to `main`/`stg`/`prod`. Runs the same diff as `check_migrations` MCP tool.

## deploy-stg MCP

`scripts/mcp-deploy/server.ts` — Bun stdio server wrapping `gh` CLI. Registered as `deploy-stg` in `.mcp.json`.

Tools: `publish_docker`, `re_pull`, `run_status`, `run_wait`, `run_logs`, `run_list`, `bump_version`, `check_migrations`, `preflight_check`, `verify_stg`, `deploy_stg` (preflight → publish → re-pull → verify → tag `stg-v<version>`), `release_stg` (preflight → bump+commit+push → publish → re-pull → verify → tag — one-shot).

Env (auto-loaded from `.env` by Bun when the MCP server starts):
- `GH_TOKEN` — gh CLI auth for non-interactive workflow dispatch. Server logs a warning to stderr on startup if missing.
- `GH_DEPLOY_REPO` (default `bipprojectbali/pm-dashboard`) — repo `gh workflow run` targets.
- `STG_BASE_URL` (default `https://pm-dashboard.wibudev.com`) — polled by `verify_stg` / `release_stg` `/api/version`.
- `STACK_NAME` (default `pm-dashboard`) — Portainer stack base name; combined with `stack_env` (e.g. `pm-dashboard-stg`). Used as the `stack_name` default in `re_pull`, `deploy_stg`, `release_stg`.
- `SHADOW_DATABASE_URL` — required by `check_migrations` / migration drift gate. Throwaway empty Postgres DB.

### Gates

- **`/api/version` endpoint** — returns `{ name, version, commit, builtAt, env }`. `commit` + `builtAt` are `null` in dev (only populated when image is built by CI with the build args above). `verify_stg` polls this endpoint to confirm a new image is live.
- **`preflight_check` tool** — one-shot safety net combining env-leak scan (git diff `origin/<branch>...HEAD` for added `.env*` files and regex patterns for AWS/GitHub/OpenAI/Slack/Google keys, private key blocks, hardcoded passwords, DB URLs with embedded creds) + branch check + clean working tree + in-sync with origin + migration drift + deploy-tag-not-exists. Allowlist: `.env.example`, `tests/fixtures/`, `*.test.ts(x)`, `CLAUDE.md`, `prisma/seed.ts`.
- **`verify_stg` tool** — polls `${STG_BASE_URL}/api/version` until reported `version` equals local `package.json` (default 120s timeout / 10s poll). Use standalone after any manual deploy or as the final step of `deploy_stg`.
- **Version gate** — `deploy_stg` derives the image tag from `package.json` `version` and refuses if `stg-v<version>` already exists on origin. Bump first via `bump_version({ level })` (or `version`), which commits `chore(release): vX.Y.Z` and pushes. `deploy_stg` also enforces branch = `stg`, clean working tree, local in sync with `origin/stg`, env-leak scan clean, and (post-deploy) `/api/version` on stg matches the new version before pushing the git tag. Pass `force: true` to redeploy the same version for emergency hotfixes; `skip_env_leak_check`, `skip_migration_check`, `skip_verify` are emergency bypasses.
- **Migration drift gate** — `deploy_stg` runs `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code` before publish. If `prisma/schema.prisma` has changes not captured in `prisma/migrations`, deploy is refused — run `bun run db:migrate --name <desc>` locally to generate the migration, commit, then deploy. Needs `SHADOW_DATABASE_URL` set (throwaway empty DB — e.g. `postgresql://user:pass@localhost:5432/pm_shadow`). Standalone tool `check_migrations` runs the same diff. Pass `skip_migration_check: true` to bypass (emergency only — the migrate sidecar won't auto-generate a missing migration).
- **Pre-deploy checks** — ensure working tree is pushed to the target branch (`stg`/`prod`), typecheck passes, Portainer stack already exists (first-time creation is manual). In practice just run `preflight_check` — it bundles all of these.
- **`release_stg` (one-shot)** — bundles `bump_version` + `deploy_stg` into a single call. Default `level=patch`. Flow: branch/clean/sync/env-leak/migration guards → bump `package.json` → commit `chore(release): vX.Y.Z` → push → publish → re-pull → verify → push deploy tag. If a phase after bump fails, the release commit is already on origin — fix the issue and run `deploy_stg` (NOT `release_stg` again, or it bumps a second time). Use `skip_bump=true` to redeploy the current version (then `force=true` if its deploy tag already exists). `dry_run=true` previews the next version + guards without mutating.

## PgBouncer note

Stg uses PgBouncer in `transaction` mode. `DATABASE_URL` must include `?pgbouncer=true` so Prisma disables prepared statements; `DIRECT_URL` points at Postgres directly and is used by the migrate sidecar (PgBouncer rejects `ALTER USER` etc.). Both `DATABASE_URL` and `DIRECT_URL` must use the same username PgBouncer knows about (`DB_USER`).
