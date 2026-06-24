import { ActionIcon, Badge, Card, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { Gantt, type GanttTask } from 'mantine-gantt'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { TbCalendarEvent } from 'react-icons/tb'
import { toLocalDateStr } from '../../lib/dates'
import {
  HDR_H,
  PROJ_COL_WIDTH,
  PROJ_EFFECTIVE_DAY_PX,
  PROJ_VIEW_OPTIONS,
  PROJECT_GANTT_COLOR,
  PROJECT_GANTT_OVERDUE,
  ROW_H,
  type ProjViewMode,
} from './constants'
import { computeTaskProgress } from './helpers'
import { ProjectsGanttLegend } from './ProjectsGanttLegend'
import { ProjectsGanttListPanel } from './ProjectsGanttListPanel'
import type { ProjectListItem } from './types'

export function ProjectsGanttView({
  projects,
  onSelect,
}: {
  projects: ProjectListItem[]
  onSelect: (p: ProjectListItem) => void
}) {
  const now = useMemo(() => new Date(), [])
  const withDates = useMemo(() => projects.filter((p) => p.startsAt && p.endsAt), [projects])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const isSyncingRef = useRef(false)
  const [viewMode, setViewMode] = useLocalStorage<ProjViewMode>({
    key: 'pm:projects:gantt-view',
    defaultValue: 'week',
  })

  const ganttTasks = useMemo<GanttTask[]>(
    () =>
      withDates.map((p) => {
        const start = new Date(p.startsAt as string)
        const end = new Date(p.endsAt as string)
        const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate())
        const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate())
        const duration = Math.max(1, Math.round((endMidnight.getTime() - startMidnight.getTime()) / 86_400_000) + 1)
        const isOverdue = end < now && p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
        const slipped = !!(p.originalEndAt && p.endsAt && p.originalEndAt !== p.endsAt)
        return {
          id: p.id,
          label: p.name,
          startDate: toLocalDateStr(start),
          duration,
          progress: computeTaskProgress(p) ?? 0,
          color: isOverdue ? PROJECT_GANTT_OVERDUE : slipped ? '#b86d2a' : PROJECT_GANTT_COLOR[p.status],
          dependencies: [],
        }
      }),
    [withDates, now],
  )

  const { tlStart, tlEnd } = useMemo(() => {
    if (withDates.length === 0) return { tlStart: undefined, tlEnd: undefined }
    const toMidnight = (ms: number) => {
      const d = new Date(ms)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    }
    const allMs = withDates.flatMap((p) => [
      new Date(p.startsAt as string).getTime(),
      new Date(p.endsAt as string).getTime(),
    ])
    return {
      tlStart: toMidnight(Math.min(...allMs) - 14 * 86_400_000),
      tlEnd: toMidnight(Math.max(...allMs) + 14 * 86_400_000),
    }
  }, [withDates])

  const scrollToToday = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (!tlStart) return
      const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
      if (!body) return
      const daysSinceStart = Math.floor((now.getTime() - tlStart.getTime()) / 86_400_000)
      const todayPx = daysSinceStart * PROJ_EFFECTIVE_DAY_PX[viewMode]
      body.scrollTo({ left: Math.max(0, todayPx - body.clientWidth / 2), behavior })
    },
    [tlStart, viewMode, now],
  )

  // Auto-scroll on first render — instant agar tidak glide
  useEffect(() => {
    if (!tlStart) return
    let attempts = 0
    const tryScroll = () => {
      const content = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineContent"]')
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
  }, [tlStart, scrollToToday])

  const syncFromGantt = useCallback(() => {
    if (isSyncingRef.current) return
    const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body || !listRef.current) return
    isSyncingRef.current = true
    listRef.current.scrollTop = body.scrollTop
    isSyncingRef.current = false
  }, [])

  const syncFromList = useCallback(() => {
    if (isSyncingRef.current) return
    const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body || !listRef.current) return
    isSyncingRef.current = true
    body.scrollTop = listRef.current.scrollTop
    isSyncingRef.current = false
  }, [])

  if (withDates.length === 0) {
    return (
      <Card withBorder p="xl" radius="md">
        <Stack align="center" gap="xs">
          <TbCalendarEvent size={32} />
          <Text fw={500}>No projects with start + end dates</Text>
          <Text size="sm" c="dimmed">
            Add dates in a project's settings to see it on the timeline.
          </Text>
        </Stack>
      </Card>
    )
  }

  const totalH = Math.max(320, withDates.length * ROW_H + HDR_H + 8)

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              {withDates.length} proyek
            </Text>
            {projects.length > withDates.length && (
              <Tooltip label={`${projects.length - withDates.length} proyek tanpa tanggal tidak ditampilkan`} withArrow>
                <Badge size="xs" variant="default" style={{ border: 'none' }}>
                  +{projects.length - withDates.length} tanpa jadwal
                </Badge>
              </Tooltip>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Tooltip label="Scroll ke hari ini" withArrow>
              <ActionIcon variant="light" size="sm" color="red" onClick={() => scrollToToday()}>
                <TbCalendarEvent size={14} />
              </ActionIcon>
            </Tooltip>
            <SegmentedControl
              size="xs"
              value={viewMode}
              onChange={(v) => setViewMode(v as ProjViewMode)}
              data={PROJ_VIEW_OPTIONS}
            />
          </Group>
        </Group>

        <ProjectsGanttLegend />

        <div
          style={{
            display: 'flex',
            height: totalH,
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          }}
        >
          <ProjectsGanttListPanel
            projects={withDates}
            now={now}
            onSelect={onSelect}
            listRef={listRef}
            onScroll={syncFromList}
          />

          <div ref={wrapperRef} style={{ flex: 1, overflow: 'hidden' }} onScroll={syncFromGantt}>
            <Gantt
              key={ganttTasks.map((t) => t.id).join(',')}
              tasks={ganttTasks}
              viewMode={viewMode}
              startDate={tlStart}
              endDate={tlEnd}
              columnWidth={PROJ_COL_WIDTH[viewMode]}
              rowHeight={ROW_H}
              taskListWidth={0}
              showTodayMarker
              showTitle
              styles={{ taskList: { display: 'none' } }}
              onTaskClick={(t) => {
                const proj = projects.find((p) => p.id === t.id)
                if (proj) onSelect(proj)
              }}
            />
          </div>
        </div>
      </Stack>
    </Card>
  )
}
