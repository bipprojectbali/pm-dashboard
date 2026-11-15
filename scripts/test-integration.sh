#!/usr/bin/env bash
#
# Integration suite, run in batches of files instead of one `bun test`.
#
# Kenapa dipecah — bukan kosmetik, ini satu-satunya bentuk yang pernah selesai:
#
# `bun test tests/integration` menjalankan ke-82 file dalam SATU proses dengan
# satu module registry (tanpa --parallel, Bun tidak mengisolasi per file), jadi
# `src/lib/db.ts` dievaluasi sekali dan satu PrismaClient melayani seluruh run.
# Pool-nya karena itu juga satu: connection_limit=17 — bukan parameter di
# connection string, melainkan default Prisma 6 (`num_physical_cpus * 2 + 1`,
# dan mesin ini 8 core) — dengan pool_timeout 10 detik, untuk run 27 menit.
#
# Pool itu tidak bocor; ia terlalu kecil dan terlalu tidak sabar untuk DB remote.
# Postgres test dijangkau lewat Tailscale: connect dingin ~2 detik, round-trip
# hangat ~100ms. Handler yang fan-out (`Promise.all` di query.handlers, chat
# context, daily-report, reorder.helpers) dan tiap `$transaction` interaktif
# masing-masing menahan koneksi, sementara koneksi BARU butuh detik-detik untuk
# dibuka — checkout yang menunggu menyerah di pool_timeout dan jadi P2024.
# Gejalanya muncul paling sering di `cleanupTestData()` karena wipeAll() adalah
# 14 deleteMany berurutan, 134 kali sepanjang run.
#
# Satu batch = satu proses = pool baru yang mati bersama batch-nya, jadi tekanan
# tidak menumpuk sepanjang 27 menit. JANGAN disederhanakan kembali jadi satu
# pemanggilan `bun test`; itu persis bentuk yang gagal.
#
# TEST_BATCH_SIZE mengubah ukuran batch (default 10 — ukuran yang terbukti
# selesai). Exit code tetap non-zero bila ada batch yang gagal, supaya gate
# pre-deploy tidak bisa hijau di atas run yang merah.
#
# Catatan: ini hanya menangani kontensi pool dalam SATU run. Dua suite paralel
# di DB yang sama saling menghapus fixture lewat cleanupTestData() — itu masalah
# terpisah dan tidak dijaga di sini.

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

if [ ! -f .env.test ]; then
  echo "test-integration: .env.test tidak ada — lihat README (setup DB test: bun run test:setup)" >&2
  exit 1
fi

# Nilai dibaca langsung ke env, tidak pernah dicetak.
DATABASE_URL=$(grep '^DATABASE_URL=' .env.test | cut -d= -f2-)
MINIO_BUCKET=$(grep '^MINIO_BUCKET=' .env.test | cut -d= -f2-)
export DATABASE_URL MINIO_BUCKET

batch_size=${TEST_BATCH_SIZE:-10}

files=(tests/integration/*.test.ts)
if [ ! -e "${files[0]}" ]; then
  echo "test-integration: tidak ada file test di tests/integration" >&2
  exit 1
fi
total=${#files[@]}

failed=""
batch=0
i=0
while [ "$i" -lt "$total" ]; do
  batch=$((batch + 1))
  slice=("${files[@]:i:batch_size}")
  echo ""
  echo "===== batch $batch — ${#slice[@]} file (${i}/${total} selesai)"
  if ! bun test --timeout 60000 "${slice[@]}"; then
    failed="$failed $batch"
  fi
  i=$((i + batch_size))
done

echo ""
if [ -n "$failed" ]; then
  echo "===== GAGAL — batch:$failed (dari $batch batch, $total file)"
  exit 1
fi
echo "===== LULUS — $total file dalam $batch batch"
