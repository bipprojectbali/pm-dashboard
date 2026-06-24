import type { TeamEvent } from './types'

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function countdown(startsAt: string): { label: string; color: string } {
  const diffMs = new Date(startsAt).getTime() - Date.now()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffMs < 0) return { label: 'Selesai', color: 'gray' }
  if (diffDays === 0) return { label: 'Hari ini', color: 'red' }
  if (diffDays === 1) return { label: 'Besok', color: 'orange' }
  if (diffDays <= 7) return { label: `${diffDays} hari lagi`, color: 'yellow' }
  return { label: `${diffDays} hari lagi`, color: 'blue' }
}

// Warna dot hari: ambil yang paling urgent dari events di hari itu
const URGENCY = ['red', 'orange', 'yellow', 'blue', 'gray']
export function dotColor(events: TeamEvent[]): string {
  const colors = events.map((e) => countdown(e.startsAt).color)
  return URGENCY.find((c) => colors.includes(c)) ?? 'blue'
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}
