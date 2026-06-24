import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { EFFECTIVE_DAY_PX, type ViewMode } from './types'

type Props = {
  timelineStart: Date | undefined
  viewMode: ViewMode
  now: Date
  savedScrollRef: { current: number | null }
}

export function useGanttScroll({ timelineStart, viewMode, now, savedScrollRef }: Props) {
  const taskListBodyRef = useRef<HTMLDivElement>(null)
  const ganttWrapperRef = useRef<HTMLDivElement>(null)
  const isSyncingRef = useRef(false)

  // Sync scroll: custom left panel -> mantine-gantt timeline body
  const syncScrollFromGantt = useCallback(() => {
    if (isSyncingRef.current) return
    const ganttBody = ganttWrapperRef.current?.querySelector<HTMLDivElement>('[class*="taskListBody"]')
    if (!ganttBody || !taskListBodyRef.current) return
    isSyncingRef.current = true
    taskListBodyRef.current.scrollTop = ganttBody.scrollTop
    isSyncingRef.current = false
  }, [])

  // Sync scroll: mantine-gantt timeline body -> custom left panel
  const syncScrollFromList = useCallback(() => {
    if (isSyncingRef.current) return
    const ganttBody = ganttWrapperRef.current?.querySelector<HTMLDivElement>('[class*="taskListBody"]')
    if (!ganttBody || !taskListBodyRef.current) return
    isSyncingRef.current = true
    ganttBody.scrollTop = taskListBodyRef.current.scrollTop
    isSyncingRef.current = false
  }, [])

  const scrollToToday = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (!timelineStart) return
      const body = ganttWrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
      if (!body) return
      const daysSinceStart = Math.floor((now.getTime() - timelineStart.getTime()) / 86_400_000)
      const todayPx = daysSinceStart * EFFECTIVE_DAY_PX[viewMode]
      body.scrollTo({ left: Math.max(0, todayPx - body.clientWidth / 2), behavior })
    },
    [timelineStart, viewMode, now],
  )

  // Restore scroll position setelah dependency toggle — sebelum browser paint agar tidak glide
  useLayoutEffect(() => {
    const saved = savedScrollRef.current
    if (saved === null) return
    savedScrollRef.current = null
    let attempts = 0
    const tryRestore = () => {
      const body = ganttWrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
      if (!body) {
        if (++attempts < 20) requestAnimationFrame(tryRestore)
        return
      }
      body.scrollLeft = saved
    }
    requestAnimationFrame(tryRestore)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to today saat mount pertama atau viewMode berubah
  useEffect(() => {
    if (!timelineStart || savedScrollRef.current !== null) return
    let attempts = 0
    const tryScroll = () => {
      const content = ganttWrapperRef.current?.querySelector<HTMLElement>('[class*="timelineContent"]')
      if (!content || content.offsetWidth < 200) {
        if (++attempts < 40) {
          setTimeout(tryScroll, 80)
          return
        }
        return
      }
      scrollToToday('instant')
    }
    setTimeout(tryScroll, 80)
  }, [timelineStart, scrollToToday]) // eslint-disable-line react-hooks/exhaustive-deps

  return { taskListBodyRef, ganttWrapperRef, syncScrollFromGantt, syncScrollFromList, scrollToToday }
}
