import { Stack, Text, Tooltip } from '@mantine/core'
import type { RefObject } from 'react'
import { fmtGanttDate, HDR_H, PROJECT_GANTT_COLOR, PROJECT_GANTT_OVERDUE, ROW_H } from './constants'
import type { ProjectListItem } from './types'

export function ProjectsGanttListPanel({
  projects,
  now,
  onSelect,
  listRef,
  onScroll,
}: {
  projects: ProjectListItem[]
  now: Date
  onSelect: (p: ProjectListItem) => void
  listRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
}) {
  return (
    <div
      style={{
        width: 200,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <div
        style={{
          height: HDR_H,
          flexShrink: 0,
          borderBottom: '1px solid var(--mantine-color-default-border)',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '0 12px 8px',
        }}
      >
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>
          Proyek
        </Text>
      </div>
      <div ref={listRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'scroll', scrollbarWidth: 'none' }}>
        {projects.map((p) => {
          const isOverdue =
            new Date(p.endsAt as string) < now && p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
          return (
            <Tooltip key={p.id} label={`${p.status.replace('_', ' ')} · ${p.priority}`} withArrow position="right">
              <button
                type="button"
                onClick={() => onSelect(p)}
                style={{
                  height: ROW_H,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  gap: 8,
                  border: 'none',
                  borderBottom: '1px solid var(--mantine-color-default-border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--mantine-color-default-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: isOverdue ? PROJECT_GANTT_OVERDUE : PROJECT_GANTT_COLOR[p.status],
                    flexShrink: 0,
                  }}
                />
                <Stack gap={1} style={{ minWidth: 0, flex: 1 }}>
                  <Text size="xs" fw={500} truncate style={{ minWidth: 0 }} title={p.name}>
                    {p.name}
                  </Text>
                  <Text size="10px" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtGanttDate(p.startsAt)} → {fmtGanttDate(p.endsAt)}
                  </Text>
                </Stack>
              </button>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
