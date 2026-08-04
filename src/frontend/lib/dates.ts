/** Format Date ke "YYYY-MM-DD" pakai timezone lokal browser, bukan UTC. */
export function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Status pill untuk waktu mulai event — Selesai/Hari ini/Besok/N hari lagi.
 * Pakai batas hari kalender (midnight-to-midnight lokal), bukan window rolling
 * 24 jam — window rolling membuat event besok bisa terbaca "Hari ini" begitu
 * sisa waktunya di bawah 24 jam penuh, padahal secara kalender masih besok.
 */
export function countdown(startsAt: string): { label: string; color: string } {
  const start = new Date(startsAt)
  const now = new Date()
  if (start.getTime() < now.getTime()) return { label: 'Selesai', color: 'gray' }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfEventDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const diffDays = Math.round((startOfEventDay.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return { label: 'Hari ini', color: 'red' }
  if (diffDays === 1) return { label: 'Besok', color: 'orange' }
  if (diffDays <= 7) return { label: `${diffDays} hari lagi`, color: 'yellow' }
  return { label: `${diffDays} hari lagi`, color: 'blue' }
}
