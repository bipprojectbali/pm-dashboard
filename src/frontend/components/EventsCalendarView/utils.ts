import { countdown } from '@/frontend/lib/dates'
import type { TeamEvent } from './types'

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export { countdown }

// Warna dot hari: ambil yang paling urgent dari events di hari itu
const URGENCY = ['red', 'orange', 'yellow', 'blue', 'gray']
export function dotColor(events: TeamEvent[]): string {
  const colors = events.map((e) => countdown(e.startsAt).color)
  return URGENCY.find((c) => colors.includes(c)) ?? 'blue'
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}
