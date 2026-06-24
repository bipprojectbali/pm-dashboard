import { ActionIcon, Badge, Card, Group, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { Gantt, type GanttTask } from 'mantine-gantt'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { TbCalendarEvent, TbTimeline } from 'react-icons/tb'
import { toLocalDateStr } from '../../../lib/dates'
import { type AnalyticsData, PROJECT_STATUS_COLOR } from './types'

const PROJ_STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'blue',
  ON_HOLD: 'yellow',
  DRAFT: 'gray',
  COMPLETED: 'green',
  CANCELLED: 'dark',
}

const PROJ_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  DRAFT: 'Draft',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const TIMELINE_COL_WIDTH = 22
const TIMELINE_ROW_H = 42
// mantine-gantt divides columnWidth by 6 for month view; use same effective per-day width for scroll calculation
const TIMELINE_EFFECTIVE_DAY_PX = Math.max(TIMELINE_COL_WIDTH / 6, 7)

export function TimelineBlock({ timeline }: { timeline: AnalyticsData['timeline'] }) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const ganttTasks = useMemo<GanttTask[]>(() => {
    const now = new Date()
    const weekOut = new Date(Date.now() + 7 * 86_400_000)
    return timeline
      .filter((p) => p.startsAt || p.endsAt)
      .map((p) => {
        const start = p.startsAt ? new Date(p.startsAt) : now
        const end = p.endsAt ? new Date(p.endsAt) : weekOut
        const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
        const suffix = [PROJ_STATUS_LABEL[p.status] ?? p.status, p.owner, p.slipped ? '⚠ slipped' : '']
          .filter(Boolean)
          .join(' · ')
        return {
          id: p.id,
          label: `${p.name}  —  ${suffix}`,
          startDate: toLocalDateStr(start),
          duration,
          progress: 0,
          color: p.slipped ? '#b86d2a' : (PROJECT_STATUS_COLOR[p.status] ?? '#4a7abf'),
        }
      })
  }, [timeline])

  const { tlStart, tlEnd } = useMemo(() => {
    const allMs = ganttTasks.flatMap((t) => {
      const s = new Date(t.startDate).getTime()
      return [s, s + t.duration * 86_400_000]
    })
    return {
      tlStart: allMs.length ? new Date(Math.min(...allMs) - 7 * 86_400_000) : undefined,
      tlEnd: allMs.length ? new Date(Math.max(...allMs) + 14 * 86_400_000) : undefined,
    }
  }, [ganttTasks])

  const statusesInData = useMemo(() => {
    const seen = new Set<string>()
    for (const p of timeline) seen.add(p.status)
    return Array.from(seen)
  }, [timeline])

  const scrollToToday = useCallback(() => {
    if (!tlStart) return
    const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body) return
    const daysSinceStart = Math.floor((Date.now() - tlStart.getTime()) / 86_400_000)
    const todayPx = daysSinceStart * TIMELINE_EFFECTIVE_DAY_PX
    body.scrollTo({ left: Math.max(0, todayPx - body.clientWidth / 2), behavior: 'smooth' })
  }, [tlStart])

  useEffect(() => {
    if (!tlStart) return
    let attempts = 0
    const tryScroll = () => {
      const content = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineContent"]')
      if (!content || content.offsetWidth < 200) {
        if (++attempts < 40) { setTimeout(tryScroll, 80); return }
        return
      }
      scrollToToday()
    }
    setTimeout(tryScroll, 80)
  }, [tlStart, scrollToToday]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap" gap="xs">
        <Group gap="xs">
          <ThemeIcon variant="light" color="indigo" size="md" radius="md">
            <TbTimeline size={16} />
          </ThemeIcon>
          <div>
            <Group gap={6} align="baseline">
              <Title order={5}>Project timeline</Title>
              <Text size="xs" c="dimmed">{ganttTasks.length} projects</Text>
            </Group>
            <Text size="xs" c="dimmed">startsAt → endsAt · read-only</Text>
          </div>
        </Group>
        <Group gap={6} wrap="wrap" align="center">
          {statusesInData.map((s) => (
            <Badge key={s} size="xs" color={PROJ_STATUS_COLOR[s] ?? 'gray'} variant="dot">
              {PROJ_STATUS_LABEL[s] ?? s}
            </Badge>
          ))}
          <Badge size="xs" color="orange" variant="dot">Slipped</Badge>
          {ganttTasks.length > 0 && (
            <Tooltip label="Scroll ke hari ini" withArrow>
              <ActionIcon variant="light" size="sm" color="red" onClick={scrollToToday}>
                <TbCalendarEvent size={13} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      {ganttTasks.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">Belum ada project aktif dengan jadwal.</Text>
      ) : (
        <div style={{ display: 'flex', height: Math.max(200, ganttTasks.length * TIMELINE_ROW_H + 60), border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden' }}>
          {/* Sidebar nama project */}
          <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--mantine-color-default-border)' }}>
            <div style={{ height: 56, flexShrink: 0, borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', alignItems: 'flex-end', padding: '0 10px 8px' }}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>Proyek</Text>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
              {timeline
                .filter((p) => p.startsAt || p.endsAt)
                .map((p) => (
                  <div key={p.id} style={{ height: TIMELINE_ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, borderBottom: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: p.slipped ? '#b86d2a' : (PROJECT_STATUS_COLOR[p.status] ?? '#4a7abf'), flexShrink: 0 }} />
                    <Text size="xs" fw={500} truncate title={p.name}>{p.name}</Text>
                  </div>
                ))}
            </div>
          </div>

          {/* Gantt timeline */}
          <div ref={wrapperRef} style={{ flex: 1, overflow: 'hidden' }}>
            <Gantt
              tasks={ganttTasks}
              viewMode="month"
              startDate={tlStart}
              endDate={tlEnd}
              columnWidth={TIMELINE_COL_WIDTH}
              rowHeight={TIMELINE_ROW_H}
              taskListWidth={0}
              showTodayMarker
              showTitle
              styles={{ taskList: { display: 'none' } }}
            />
          </div>
        </div>
      )}
    </Card>
  )
}
