export const DEFAULT_INSTRUCTION = `Tulis laporan manajemen harian dalam *bahasa Indonesia*. Format: Telegram Markdown (*bold*, _italic_). Padat, berbasis data, tanpa narasi berlebihan.

Struktur wajib:

*📊 Laporan Harian — {TANGGAL}*
[1 kalimat status keseluruhan: jumlah task aktif, velocity, level risiko]

*Ringkasan Metrik*
• Total task open: X | Overdue: X | Closed 7h: X | Stale: X
• Velocity minggu ini: X task/minggu
• Risiko: [NONE/LOW/MEDIUM/HIGH]

*Status Project* (hanya project ACTIVE)
Untuk setiap project: nama, grade (A–F), skor, open/overdue/blocked, sisa hari. Satu baris per project.

*Performa Tim*
Untuk setiap anggota: nama, open task, overdue, closed 7h. Tandai OVERLOADED jika relevan. Satu baris per orang.

*Tindakan Diperlukan* (maks 3 poin)
Hanya item yang membutuhkan keputusan atau eskalasi — disertai angka dan deadline konkret.

*Tanggapan & Analisis*
Penilaian singkat kondisi hari ini: apa yang berjalan baik, apa yang mengkhawatirkan, pola atau tren yang perlu diperhatikan. Berbasis angka, bukan opini umum.

*Rangkuman Eksekutif*
3–5 poin ringkas kondisi keseluruhan tim dan project. Cocok dibaca dalam 30 detik.

*Saran*
Rekomendasi konkret berbasis data — maks 3 item, masing-masing dengan alasan singkat dan metrik pendukung.

*Tindakan Segera*
Daftar aksi spesifik yang harus diambil besok, dengan penanggung jawab (jika ada dari data tim) dan target waktu.

_pm-dashboard AI report_`

export const MODEL_OPTIONS = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (terbaik, lebih lambat)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (seimbang)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (cepat, hemat)' },
]

export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB — Jakarta (UTC+7)', short: 'WIB' },
  { value: 'Asia/Makassar', label: 'WITA — Makassar (UTC+8)', short: 'WITA' },
  { value: 'Asia/Jayapura', label: 'WIT — Jayapura (UTC+9)', short: 'WIT' },
  { value: 'UTC', label: 'UTC (UTC+0)', short: 'UTC' },
]

export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

export const tzShortLabel = (tz: string) => TIMEZONE_OPTIONS.find((t) => t.value === tz)?.short ?? tz

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function saveSetting(key: string, value: string) {
  return apiFetch('/api/admin/app-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
}

export function getSecondsUntil(h: number, m: number, tz: string): number {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
  const nowSecs = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second')
  const schedSecs = h * 3600 + m * 60
  let delta = schedSecs - nowSecs
  if (delta <= 0) delta += 86400
  return delta
}

export function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function fmtLocalTime(tz: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
}
