import { Badge, Group, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { TbAlertTriangle, TbTarget } from 'react-icons/tb'
import type { ProjectDetail } from '../ProjectsPanel'
import { PRIORITY_COLOR, ROLE_COLOR, STATUS_COLOR, computeOverdue, formatDate, isSystemAdmin } from './types'

export function ProjectHeader({
  project,
  systemRole,
  canWrite,
  myRole,
}: {
  project: ProjectDetail
  systemRole: string | null
  canWrite: boolean
  myRole: string | null
}) {
  const { overdue, daysOver } = computeOverdue(project)
  const extended =
    project.originalEndAt &&
    project.endsAt &&
    new Date(project.endsAt).getTime() !== new Date(project.originalEndAt).getTime()

  return (
    <Stack gap="xs">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon variant="light" color={STATUS_COLOR[project.status]} size="xl" radius="md">
          <TbTarget size={22} />
        </ThemeIcon>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Title order={2} style={{ lineHeight: 1.2 }}>
            {project.name}
          </Title>
          <Group gap={6} wrap="wrap">
            <Badge color={STATUS_COLOR[project.status]} variant="light" size="sm">
              {project.status.replace('_', ' ')}
            </Badge>
            <Badge color={PRIORITY_COLOR[project.priority]} variant="dot" size="sm">
              {project.priority}
            </Badge>
            {myRole ? (
              <Badge color={ROLE_COLOR[myRole] ?? 'gray'} variant="light" size="sm">
                {myRole}
              </Badge>
            ) : isSystemAdmin(systemRole) ? (
              <Badge color="gray" variant="outline" size="sm">
                ADMIN VIEW
              </Badge>
            ) : null}
            {overdue && (
              <Badge color="red" variant="filled" size="sm" leftSection={<TbAlertTriangle size={10} />}>
                Overdue {daysOver}d
              </Badge>
            )}
            {extended && (
              <Tooltip label={`Original deadline: ${formatDate(project.originalEndAt)}`}>
                <Badge color="grape" variant="light" size="sm">
                  Extended
                </Badge>
              </Tooltip>
            )}
            {project.visibility === 'PRIVATE' && (
              <Tooltip label="Proyek privat — hanya anggota yang dapat mengakses">
                <Badge color="dark" variant="filled" size="sm">
                  Private
                </Badge>
              </Tooltip>
            )}
            {project.visibility === 'PUBLIC' && (
              <Badge color="cyan" variant="light" size="sm">
                Public
              </Badge>
            )}
            {!canWrite && (
              <Tooltip label="Kamu bukan anggota proyek ini — hanya bisa melihat">
                <Badge color="gray" variant="outline" size="sm">
                  Read-only
                </Badge>
              </Tooltip>
            )}
          </Group>
          {project.description && (
            <Text size="sm" c="dimmed">
              {project.description}
            </Text>
          )}
        </Stack>
      </Group>
    </Stack>
  )
}
