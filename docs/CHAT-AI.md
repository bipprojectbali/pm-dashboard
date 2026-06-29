# Chat AI Knowledge Base

Admin Chat AI di `/admin?tab=chat` menjawab pertanyaan operasional dari data DB. Pengetahuan dibangun dari dua lapisan terpisah: **live context** (snapshot ringkas, dibangun saat pesan pertama dalam sesi) dan **RAG knowledge base** (`chat_document` table, di-sync periodik). Jawaban menyertakan citation `[#n]` yang merujuk ke dokumen sumber.

## Arsitektur

```
User prompt
   ├─→ buildChatContext()       (system prompt, snapshot KPI/roster/effort/github 7h)
   ├─→ retrieveRelevantDocs()   (top-6 hits dari chat_document via pgvector → FTS → trigram)
   └─→ streamChatSSE() → Anthropic API (tool_use loop, max 5 iter)
                ↓
        CHAT_TOOLS (5 read-only): query_users | query_tasks | query_project_detail
                                  query_github_activity | query_effort
                ↓
        SSE events: phase | system | docs | sources | tool_use | tool_result
                    token | done | error
```

- **Live context** (`src/lib/chat.ts:buildChatContext`) — di-cache di state frontend setelah pertama kali dimuat; tombol "Refresh Konteks" membatalkan cache tanpa menghapus history.
- **RAG** (`src/lib/chat-documents.ts:searchDocuments`) — di-query setiap pesan. Hasil di-render sebagai daftar `[#1] type: title\ncontent` di system prompt, dan metadata-nya dikirim ke FE via SSE event `sources`.

## Sync schedule

- **Startup**: `syncChatDocuments({ full: true })` dipanggil di `src/index.tsx` saat boot (include retro + orphan prune).
- **Cron**: `Bun.cron('*/10 * * * *')` jalankan `syncChatDocuments({ full: false })` — incremental, refresh aggregate docs (github/effort/ghost), tanpa prune.
- **Manual**: tombol "Perbarui Pengetahuan" di Chat panel → `POST /api/admin/chat/sync` → full sync + prune.

## Doc types

`ChatDocument` unique per `(type, entityId)`. Sumber masing-masing:

| Type | Source | Window | Catatan |
|---|---|---|---|
| `user` | `prisma.user` (blocked=false) | active | include open & overdue tasks |
| `task` | `prisma.task` (deletedAt=null, open OR closed<30d) | 30d | include 5 komentar + 3 status change terbaru |
| `project` | `prisma.project` (archivedAt=null, status active) | active | include members + milestones mendatang |
| `event` | `prisma.event` (startsAt≥now) | upcoming | |
| `comment` | `prisma.taskComment` | 7d (incremental) | top 100 |
| `github_project` | `computeProjectGithubSummary` per project linked | always | 30d stats + open PRs + recent events |
| `effort_user` | `computePhantomWork({ days: 7 })` | 7d | per user, top 50 |
| `effort_task` | `effortReport()` filter `verdict in ['over','under']` | active | |
| `ghost_task` | `detectGhostTasks({ staleDays: 5 })` | active | |
| `milestone` | `prisma.projectMilestone` | all | top 500 |
| `extension` | `prisma.projectExtension` | all | top 300 |
| `dependency` | `prisma.taskDependency` grouped by taskId | active | satu doc per task yang punya blocker |
| `evidence` | `prisma.taskEvidence` | all | top 500 |
| `audit_recent` | `prisma.auditLog` action in ROLE_CHANGED/BLOCKED/UNBLOCKED | 30d | top 200 |
| `agent_status` | `prisma.agent` | all | include claimedBy |
| `report_history` | `prisma.reportHistory` | 30d | top 100 |
| `project_retro` | `computeRetro({ since: 14d })` + `renderRetroMarkdown` | **full-sync only** | mahal — 7 query per project, batch of 5 |

## Search algorithm

`searchDocuments(query, limit=6, typeFilter?)`:

1. **Semantic (pgvector)** — kalau `embedding.apiKey` dikonfigurasi: generate embedding query → cosine distance, threshold `1 - distance > 0.35`. Kalau ≥3 hit, return langsung.
2. **FTS** — `to_tsvector('simple') @@ to_tsquery(keywords)` dengan `extractKeywords()` (stopword ID + capitalized name extraction). Fallback ke `plainto_tsquery` kalau query parse gagal.
3. **Trigram fuzzy** — `similarity(title, name) > 0.2` untuk proper noun yang capitalized. Hanya jalan kalau total hit < 3.

Hasil di-merge unik berdasarkan `id`, return `{ hits: DocHit[], formatted: string }` di mana `formatted` sudah ber-prefix `[#1]…[#N]`.

## Citation flow

- System prompt di `streamChatSSE()` menginstruksikan: "Jika menyebut fakta dari dokumen referensi, sertakan tag `[#N]` sesudahnya. Jangan halusinasi entitas yang tidak ada di referensi atau system context."
- SSE emit event `sources` (sebelum `token` pertama) dengan `[{ ref, type, entityId, title }]`. FE simpan dan render footer badge per assistant bubble.
- Event `done` juga membawa `sources` sebagai fallback bila browser miss event awal.

## Orphan prune (full-sync only)

`pruneOrphanDocs()` dijalankan di akhir `syncChatDocuments({ full: true })`. Per type, query `valid entityIds` dari source table, hapus row di `chat_document` yang `entityId`-nya tidak ada di set valid. Window: user/blocked, task/(open atau closed<180d), project/(active dan archived<90d), event/startsAt≥-7d, comment/<30d, audit/report/<30d. Return count `pruned`.

## Tool-calling layer

Sumber: `src/lib/chat-tools.ts`. 5 tool read-only, semua validasi input via Zod, hasil cap 50 row. Tools wajib dipakai untuk pertanyaan numerik/agregat — snapshot live context bisa stale beberapa menit, tool langsung hit DB.

| Tool | Mode / path | Output |
|---|---|---|
| `query_users` | filter `query` (substring nama/email), `role`, `includeBlocked` | per user: `openTasks`, `overdueTasks`, `sumEstimateHours`, `projectCount` |
| `query_tasks` | `mode=list` atau `mode=aggregate` dengan `groupBy: status\|priority\|kind\|assignee\|project`. Filter: project (id/name), assignee (email/name), `status[]`, `priority[]`, `kind[]`, `overdueOnly`, `createdSinceDays`, `closedSinceDays` | list: detail task + flag `overdue`. aggregate: `[{ key, count, sumEstimateHours }]` |
| `query_project_detail` | resolve by id atau name (substring) | members, milestones (+flag `overdue`), extensions, `taskBreakdown` per status, `overdueTasks` |
| `query_github_activity` | 3 path: project-scoped (delegate `computeProjectGithubSummary`), actor-scoped (`actorLogin` filter), global top contributors. Window default 7 hari, maks 90 | recent events + top contributors + `commits7d/30d`, `openPrs` |
| `query_effort` | `mode=user` (phantom work, reuse `computePhantomWork`), `mode=task` (`computeTaskEffort`), `mode=overbudget` (`effortReport` filter verdict) | rows + summary count over/under |

Loop kerja di `streamChatSSE`:
1. Build conversation history (last user message di-augment dengan `relevantDocs`).
2. Tiap iterasi: emit SSE `phase` di awal (iter 0 `"Menganalisis pertanyaan..."`, iter 1+ `"Memproses data & menyusun jawaban..."`), lalu non-streaming POST ke Anthropic `messages` API dengan `tools: CHAT_TOOLS`. Text block → emit SSE `token`.
3. `stop_reason === 'tool_use'`: emit SSE `phase` `"Mencari data..."` (supaya label loading tidak macet di "Menganalisis pertanyaan..." selama eksekusi tool), lalu execute setiap `tool_use` block via `executeChatTool`, emit `tool_use` + `tool_result` SSE, append `tool_result` ke conversation, loop.
4. Iterasi terakhir (ke-5) di-call tanpa `tools` agar AI dipaksa jawab tanpa tool baru.
5. Final `done` event bawa `full` text + `sources` + `toolCalls` trace.

Frontend (`AdminChatPanel.tsx`):
- `ToolCallCard` collapsible per call dengan badge status: gray "menjalankan…" → red "error" / yellow "kosong" / teal "N row{+ kalau truncated}".
- `ToolCallsSection` header "DIVERIFIKASI DARI N TOOL CALL" di atas markdown content. Tool calls ter-persist ke `ChatMessage.toolCalls`.

## Embedding settings

Optional — kalau ada, semantic search jalan; kalau tidak, FTS+trigram tetap jalan.

- `embedding.apiKey` — Bearer key, compatible OpenAI embeddings API (OpenRouter, OpenAI, dll)
- `embedding.baseUrl` — default `https://openrouter.ai/api/v1`
- `embedding.model` — default `openai/text-embedding-3-small` (1536 dim)

Cache modul-level di `chat-documents.ts` di-invalidate otomatis oleh `setSetting()` saat key `embedding.*` berubah (`src/lib/app-settings.ts`).

## Bug & cacat yang sudah diperbaiki

- `computeProjectHealth` dulu tidak include `members`; live context "tim aktif" sekarang query terpisah `prisma.projectMember.findMany` lalu group manual.
- `_embeddingSettingsCache` dulu tidak pernah dibersihkan; sekarang di-invalidate via `invalidateEmbeddingCache()` saat setting embedding.* berubah.
- Semantic search dulu tidak punya threshold → muncul dokumen tidak relevan; sekarang `cosine > 0.35` minimum.
- Tidak ada orphan prune — `chat_document` menumpuk; sekarang full-sync membersihkan per-type.
