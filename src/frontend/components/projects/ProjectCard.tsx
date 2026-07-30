import { ActionIcon, Avatar, Badge, Card, Group, Text, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { TbAlertTriangle, TbCalendarEvent, TbFolder, TbPencil } from 'react-icons/tb'
import { UserAvatar } from '../shared/UserAvatar'
import { computeHealth, computeOverdue, computeTimeProgress, formatDate, isExtended } from './helpers'
import { ProjectCardStats } from './ProjectCardStats'
import { PRIORITY_COLOR, type ProjectListItem, STATUS_BG } from './types'

const _STATUS_DOT: Record<string, string> = {
  ACTIVE: 'var(--mantine-color-blue-5)',
  DRAFT: 'var(--mantine-color-gray-5)',
  ON_HOLD: 'var(--mantine-color-yellow-5)',
  COMPLETED: 'var(--mantine-color-green-5)',
  CANCELLED: 'var(--mantine-color-red-5)',
}

export function ProjectCard({
  project: p,
  density,
  isSystemAdmin: isAdmin,
  onOpen,
  onEdit,
}: {
  project: ProjectListItem
  density: 'comfortable' | 'compact'
  isSystemAdmin: boolean
  onOpen?: () => void
  onEdit: () => void
}) {
  const { overdue, daysOver } = computeOverdue(p)
  const timeProgress = computeTimeProgress(p)
  const health = computeHealth(p)
  const extended = isExtended(p)
  const canEdit = isAdmin || p.myRole === 'OWNER' || p.myRole === 'PM'
  const compact = density === 'compact'
  const [hover, setHover] = useState(false)

  const statusBg = overdue ? 'rgba(250,82,82,0.06)' : STATUS_BG[p.status]
  const pad = compact ? 'sm' : 'md'

  return (
    <Card
      withBorder
      padding={0}
      radius="md"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: onOpen ? 'pointer' : 'default',
        background: statusBg,
        transform: hover && onOpen ? 'translateY(-1px)' : undefined,
        boxShadow: hover && onOpen ? '0 4px 16px rgba(0,0,0,0.10)' : undefined,
        transition: 'all 120ms ease',
      }}
      onClick={onOpen}
    >
      <Card.Section inheritPadding py={compact ? 'xs' : 'sm'} px={pad}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text fw={700} size={compact ? 'sm' : 'md'} lineClamp={1} style={{ flex: 1 }}>
            {p.name}
          </Text>
          {canEdit && (
            <Tooltip label="Edit project">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
              >
                <TbPencil size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        <Group gap={4} wrap="wrap" mt={4}>
          <Badge variant="default" size="xs" style={{ border: 'none' }}>
            {p.status.replace('_', ' ')}
          </Badge>
          <Badge
            variant="default"
            size="xs"
            style={{ border: 'none' }}
            leftSection={
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: `var(--mantine-color-${PRIORITY_COLOR[p.priority]}-6)`,
                  flexShrink: 0,
                }}
              />
            }
          >
            {p.priority}
          </Badge>
          {p.myRole ? (
            <Badge variant="default" size="xs" style={{ border: 'none' }}>
              {p.myRole}
            </Badge>
          ) : isAdmin ? (
            <Badge variant="default" size="xs" style={{ border: 'none' }}>
              ADMIN VIEW
            </Badge>
          ) : (
            <Badge variant="default" size="xs" style={{ border: 'none' }}>
              READ-ONLY
            </Badge>
          )}
          {p.visibility === 'PRIVATE' && (
            <Badge variant="default" size="xs" style={{ border: 'none' }}>
              PRIVATE
            </Badge>
          )}
          {overdue && (
            <Badge
              variant="default"
              size="xs"
              style={{ border: 'none' }}
              leftSection={<TbAlertTriangle size={10} color="var(--mantine-color-red-6)" />}
            >
              Overdue {daysOver}d
            </Badge>
          )}
          {health && (
            <Tooltip label="Derived from task-completion pace vs. time elapsed">
              <Badge
                variant="default"
                size="xs"
                style={{ border: 'none' }}
                leftSection={
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: `var(--mantine-color-${health.color}-6)`,
                      flexShrink: 0,
                    }}
                  />
                }
              >
                {health.label.toUpperCase()}
              </Badge>
            </Tooltip>
          )}
          {extended && (
            <Tooltip label={`Original deadline: ${formatDate(p.originalEndAt)}`}>
              <Badge variant="default" size="xs" style={{ border: 'none' }}>
                Extended
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Card.Section>

      <Card.Section inheritPadding px={pad} pb={compact ? 'xs' : 'sm'}>
        {!compact && (
          <Text size="xs" c="dimmed" lineClamp={2} mb="xs">
            {p.description || 'No description'}
          </Text>
        )}

        {(p.startsAt || p.endsAt) && (
          <Group gap={4} mb={6}>
            <TbCalendarEvent size={12} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              {formatDate(p.startsAt)} → {formatDate(p.endsAt)}
            </Text>
          </Group>
        )}

        <ProjectCardStats
          timeProgress={timeProgress}
          overdue={overdue}
          taskStats={p.taskStats}
          milestoneStats={p.milestoneStats}
        />
      </Card.Section>

      <Card.Section
        inheritPadding
        px={pad}
        py="xs"
        style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Avatar.Group spacing="sm">
            {p.members.slice(0, 4).map((m) => (
              <Tooltip key={m.userId} label={`${m.user.name} · ${m.role}`} withArrow>
                <UserAvatar name={m.user.name} image={m.user.image} size={22} color="blue" />
              </Tooltip>
            ))}
            {p.members.length > 4 && (
              <Tooltip label={`${p.members.length - 4} more members`} withArrow>
                <Avatar size={22} radius="xl" color="gray">
                  +{p.members.length - 4}
                </Avatar>
              </Tooltip>
            )}
          </Avatar.Group>

          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <Tooltip label={`${p._count.tasks} tasks`}>
              <Group gap={3} wrap="nowrap">
                <TbFolder size={12} />
                <Text size="xs" c="dimmed">
                  {p._count.tasks}
                </Text>
              </Group>
            </Tooltip>
            <Tooltip label={`Owner: ${p.owner.name}`}>
              <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                <UserAvatar
                  name={p.owner.name}
                  image={p.owner.image}
                  size={18}
                  color="blue"
                  style={{ flexShrink: 0 }}
                />
                <Text size="xs" c="dimmed" truncate style={{ maxWidth: 90 }}>
                  {p.owner.name.split(' ')[0]}
                </Text>
              </Group>
            </Tooltip>
          </Group>
        </Group>
      </Card.Section>
    </Card>
  )
}
