import type { GanttTask } from 'mantine-gantt'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toLocalDateStr } from '../../../lib/dates'
import { AP_PROJ_COLOR, AP_PROJ_LABEL } from './constants'
import type { OverviewAnalytics, TimelineRow } from './types'

const AP_EFFECTIVE_DAY_PX = Math.max(22 / 6, 7)

export function useAnalyticsTimeline(overviewData: OverviewAnalytics | undefined) {
  const timelineTasks = useMemo<GanttTask[]>(() => {
    const rows = overviewData?.timeline ?? []
    const now = new Date()
    const weekOut = new Date(Date.now() + 7 * 86_400_000)
    return rows
      .filter((r) => r.startsAt || r.endsAt)
      .sort((a, b) => (a.endsAt ?? '').localeCompare(b.endsAt ?? ''))
      .slice(0, 12)
      .map((r) => {
        const start = r.startsAt ? new Date(r.startsAt) : now
        const end = r.endsAt ? new Date(r.endsAt) : weekOut
        const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
        const suffix = [AP_PROJ_LABEL[r.status] ?? r.status, r.slipped ? '⚠ slipped' : ''].filter(Boolean).join(' · ')
        return {
          id: r.id,
          label: `${r.name}  —  ${suffix}`,
          startDate: toLocalDateStr(start),
          duration,
          progress: 0,
          color: r.slipped ? 'orange' : (AP_PROJ_COLOR[r.status] ?? 'blue'),
        }
      })
  }, [overviewData])

  const { tlStart, tlEnd } = useMemo(() => {
    const ms = timelineTasks.flatMap((t) => {
      const s = new Date(t.startDate).getTime()
      return [s, s + t.duration * 86_400_000]
    })
    return {
      tlStart: ms.length ? new Date(Math.min(...ms) - 7 * 86_400_000) : undefined,
      tlEnd: ms.length ? new Date(Math.max(...ms) + 14 * 86_400_000) : undefined,
    }
  }, [timelineTasks])

  const tlWrapperRef = useRef<HTMLDivElement>(null)

  const scrollToToday = useCallback(() => {
    if (!tlStart) return
    const body = tlWrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body) return
    const daysSinceStart = Math.floor((Date.now() - tlStart.getTime()) / 86_400_000)
    body.scrollTo({
      left: Math.max(0, daysSinceStart * AP_EFFECTIVE_DAY_PX - body.clientWidth / 2),
      behavior: 'smooth',
    })
  }, [tlStart])

  useEffect(() => {
    if (!tlStart) return
    let attempts = 0
    const tryScroll = () => {
      const content = tlWrapperRef.current?.querySelector<HTMLElement>('[class*="timelineContent"]')
      if (!content || content.offsetWidth < 200) {
        if (++attempts < 40) {
          setTimeout(tryScroll, 80)
          return
        }
        return
      }
      scrollToToday()
    }
    setTimeout(tryScroll, 80)
  }, [tlStart, scrollToToday]) // eslint-disable-line react-hooks/exhaustive-deps

  const timelineRows = useMemo<TimelineRow[]>(() => {
    const rows = overviewData?.timeline ?? []
    const now = new Date()
    const weekOut = new Date(Date.now() + 7 * 86_400_000)
    return rows
      .filter((r) => r.startsAt || r.endsAt)
      .sort((a, b) => (a.endsAt ?? '').localeCompare(b.endsAt ?? ''))
      .slice(0, 12)
      .map((r) => ({
        ...r,
        start: r.startsAt ? new Date(r.startsAt) : now,
        end: r.endsAt ? new Date(r.endsAt) : weekOut,
      }))
  }, [overviewData])

  return { timelineTasks, timelineRows, tlStart, tlEnd, tlWrapperRef, scrollToToday }
}
