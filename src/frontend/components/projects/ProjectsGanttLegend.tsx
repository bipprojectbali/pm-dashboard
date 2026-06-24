import { Badge, Group } from '@mantine/core'
import type { ProjectStatus } from './types'
import { PROJECT_GANTT_COLOR, PROJECT_GANTT_OVERDUE } from './constants'

export function ProjectsGanttLegend() {
  return (
    <Group gap={6} wrap="wrap">
      {(Object.entries(PROJECT_GANTT_COLOR) as [ProjectStatus, string][]).map(([status, color]) => (
        <Badge
          key={status}
          size="xs"
          variant="default"
          style={{ border: 'none' }}
          leftSection={
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
          }
        >
          {status.replace('_', ' ')}
        </Badge>
      ))}
      <Badge
        size="xs"
        variant="default"
        style={{ border: 'none' }}
        leftSection={
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#b86d2a', flexShrink: 0 }} />
        }
      >
        Slipped
      </Badge>
      <Badge
        size="xs"
        variant="default"
        style={{ border: 'none' }}
        leftSection={
          <div
            style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: PROJECT_GANTT_OVERDUE, flexShrink: 0 }}
          />
        }
      >
        Overdue
      </Badge>
    </Group>
  )
}
