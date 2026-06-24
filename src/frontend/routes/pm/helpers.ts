export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const suffix = diff >= 0 ? 'lalu' : 'lagi'
  if (days > 0) return `${days}h ${suffix}`
  if (hours > 0) return `${hours}j ${suffix}`
  if (mins > 0) return `${mins}m ${suffix}`
  return 'baru saja'
}
