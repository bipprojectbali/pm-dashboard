# Chat AI Knowledge Base

Admin Chat AI di `/admin?tab=chat` menjawab pertanyaan operasional dari data DB. Pengetahuan dibangun dari dua lapisan terpisah: **live context** (snapshot ringkas, dibangun saat pesan pertama dalam sesi) dan **RAG knowledge base** (`chat_document` table, di-sync periodik). Jawaban menyertakan citation `[#n]` yang merujuk ke dokumen sumber.

## Arsitektur

```
User prompt
   ├─→ buildChatContext()       (system prompt, snapshot KPI/roster/effort/github 7h)
   └─→ retrieveRelevantDocs()   (top-6 hits dari chat_document via pgvector → FTS → trigram)
                                  ↓
                           streamChatSSE() → Anthropic API
                                  ↓
              SSE events: phase | system | docs | sources | token | done | error
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
