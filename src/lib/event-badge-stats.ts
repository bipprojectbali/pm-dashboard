import { prisma } from './db'

export type EventBadgeStats = { todayCount: number; tomorrowCount: number; next7dCount: number; total: number }

// Upcoming-event counts backing the sidebar badge (today+tomorrow) and the
// "Events Mendatang" overview cards on /pm and Admin (today+next 7 days). These
// used to be derived client-side by filtering a `GET /api/events?upcoming=true
// &limit=100` response — once more than 100 upcoming events existed, every
// consumer silently under-reported (same bug class already fixed for the Tasks
// dashboard cards: see src/lib/task-dashboard-stats.ts). Computed directly via
// prisma.event.count() so the numbers stay correct no matter how many events
// exist. `today`/`tomorrow` use calendar-day boundaries (not a rolling 24h/48h
// window), matching the original client-side `startsAt.slice(0, 10) === todayStr`
// comparison.
export async function computeEventBadgeStats(): Promise<EventBadgeStats> {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
  const startOfDayAfterTomorrow = new Date(startOfToday.getTime() + 2 * 24 * 60 * 60 * 1000)
  const startOfDayIn7 = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [todayCount, tomorrowCount, next7dCount, total] = await Promise.all([
    prisma.event.count({ where: { startsAt: { gte: now, lt: startOfTomorrow } } }),
    prisma.event.count({ where: { startsAt: { gte: startOfTomorrow, lt: startOfDayAfterTomorrow } } }),
    prisma.event.count({ where: { startsAt: { gte: now, lt: startOfDayIn7 } } }),
    prisma.event.count({ where: { startsAt: { gte: now } } }),
  ])

  return { todayCount, tomorrowCount, next7dCount, total }
}
