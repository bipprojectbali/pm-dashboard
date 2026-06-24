import { ActionIcon, Badge, Group, Text, Tooltip } from '@mantine/core'
import { Gantt, type GanttTask } from 'mantine-gantt'
import type { RefObject } from 'react'
import { TbCalendarEvent } from 'react-icons/tb'
import { ChartCard } from './ChartCard'
import { AP_PROJ_COLOR, AP_PROJ_LABEL } from './constants'
import type { TimelineRow } from './types'

export function GanttSection({
  timelineTasks,
  timelineRows,
  tlStart,
  tlEnd,
  tlWrapperRef,
  onScrollToToday,
}: {
  timelineTasks: GanttTask[]
  timelineRows: TimelineRow[]
  tlStart: Date | undefined
  tlEnd: Date | undefined
  tlWrapperRef: RefObject<HTMLDivElement | null>
  onScrollToToday: () => void
}) {
  return (
    <ChartCard
      title={`Timeline Proyek${timelineTasks.length > 0 ? ` · ${timelineTasks.length} projects` : ''}`}
      subtitle="Oranye = slipped deadline · read-only"
      tip="Gantt chart startsAt → endsAt tiap proyek ACTIVE. Oranye = slipped (deadline pernah diperpanjang via extension)."
    >
      {timelineTasks.length > 0 && (
        <Group gap={6} mb="xs" wrap="wrap">
          {Object.entries(AP_PROJ_COLOR).map(([s, c]) => (
            <Badge key={s} size="xs" color={c} variant="dot">
              {AP_PROJ_LABEL[s] ?? s}
            </Badge>
          ))}
          <Badge size="xs" color="orange" variant="dot">
            Slipped
          </Badge>
        </Group>
      )}
      {timelineTasks.length > 0 && (
        <Group justify="flex-end" mb="xs">
          <Tooltip label="Scroll ke hari ini" withArrow>
            <ActionIcon variant="light" size="sm" color="red" onClick={onScrollToToday}>
              <TbCalendarEvent size={13} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
      {timelineTasks.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          Belum ada project aktif dengan jadwal.
        </Text>
      ) : (
        <div
          style={{
            display: 'flex',
            height: Math.max(200, timelineTasks.length * 42 + 60),
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: 180,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <div
              style={{
                height: 56,
                flexShrink: 0,
                borderBottom: '1px solid var(--mantine-color-default-border)',
                display: 'flex',
                alignItems: 'flex-end',
                padding: '0 10px 8px',
              }}
            >
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>
                Proyek
              </Text>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
              {timelineRows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    height: 42,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    gap: 6,
                    borderBottom: '1px solid var(--mantine-color-default-border)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: r.slipped
                        ? '#b86d2a'
                        : `var(--mantine-color-${AP_PROJ_COLOR[r.status] ?? 'blue'}-6)`,
                      flexShrink: 0,
                    }}
                  />
                  <Text size="xs" fw={500} truncate title={r.name}>
                    {r.name}
                  </Text>
                </div>
              ))}
            </div>
          </div>
          <div ref={tlWrapperRef} style={{ flex: 1, overflow: 'hidden' }}>
            <Gantt
              tasks={timelineTasks}
              viewMode="month"
              startDate={tlStart}
              endDate={tlEnd}
              columnWidth={22}
              rowHeight={42}
              taskListWidth={0}
              showTodayMarker
              showTitle
              styles={{ taskList: { display: 'none' } }}
            />
          </div>
        </div>
      )}
    </ChartCard>
  )
}
