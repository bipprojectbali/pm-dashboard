import { Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core'
import type { IconType } from 'react-icons'
import { TbCalendarEvent, TbChecks, TbClock, TbFlag, TbListCheck, TbTarget, TbUsers } from 'react-icons/tb'
import { useIsExtensionEnabled } from '../../hooks/useExtensions'
import { GithubActivityCard } from '../GithubActivityCard'
import type { ProjectDetail } from '../ProjectsPanel'
import { UserAvatar } from '../shared/UserAvatar'
import { ROLE_COLOR, computeOverdue, computeTimeProgress, formatDate } from './types'

function StatMini({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  icon: IconType
  color: string
}) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed" fw={500} tt="uppercase">
            {label}
          </Text>
          <Text fw={700} size="xl">
            {value}
          </Text>
        </div>
        <ThemeIcon variant="light" color={color} size="lg" radius="md">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
    </Card>
  )
}

export function OverviewTab({ project, onOpenTasks }: { project: ProjectDetail; onOpenTasks: () => void }) {
  const timeProgress = computeTimeProgress(project)
  const { overdue } = computeOverdue(project)
  const ts = project.taskStats
  const ms = project.milestoneStats
  const githubEnabled = useIsExtensionEnabled('github')

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <StatMini label="Members" value={String(project._count.members)} icon={TbUsers} color="blue" />
        <StatMini
          label="Tasks"
          value={`${ts?.closed ?? 0}/${ts?.total ?? project._count.tasks}`}
          icon={TbListCheck}
          color="orange"
        />
        <StatMini
          label="Milestones"
          value={`${ms?.done ?? 0}/${ms?.total ?? project._count.milestones}`}
          icon={TbFlag}
          color="grape"
        />
        <StatMini
          label="Timeline"
          value={timeProgress !== null ? `${timeProgress}%` : '—'}
          icon={TbClock}
          color={overdue ? 'red' : 'teal'}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder padding="md" radius="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Dates
              </Text>
              <Text size="xs" c="dimmed">
                Start → End
              </Text>
            </Group>
            <Group gap={6}>
              <TbCalendarEvent size={14} />
              <Text size="sm">
                {formatDate(project.startsAt)} → {formatDate(project.endsAt)}
              </Text>
            </Group>
            {project.originalEndAt && (
              <Text size="xs" c="dimmed">
                Original deadline: {formatDate(project.originalEndAt)}
              </Text>
            )}
            {timeProgress !== null && (
              <div>
                <Group justify="space-between" gap={4}>
                  <Text size="xs" c="dimmed">
                    Time elapsed
                  </Text>
                  <Text size="xs" c={overdue ? 'red' : 'dimmed'}>
                    {timeProgress}%
                  </Text>
                </Group>
                <Progress
                  value={timeProgress}
                  size="sm"
                  mt={4}
                  color={overdue ? 'red' : timeProgress > 80 ? 'orange' : 'blue'}
                />
              </div>
            )}
          </Stack>
        </Card>

        <Card withBorder padding="md" radius="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Task progress
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={onOpenTasks}>
                Open tasks
              </Button>
            </Group>
            {ts && ts.total > 0 ? (
              <>
                <Group justify="space-between" gap={4}>
                  <Group gap={4}>
                    <TbChecks size={14} />
                    <Text size="xs" c="dimmed">
                      {ts.closed} closed · {ts.inProgress} in progress · {ts.readyForQc} QC ·{' '}
                      {ts.open + ts.reopened} open
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {Math.round((ts.closed / ts.total) * 100)}%
                  </Text>
                </Group>
                <Progress.Root size="sm" mt={4}>
                  <Progress.Section value={(ts.closed / ts.total) * 100} color="green" />
                  <Progress.Section value={(ts.readyForQc / ts.total) * 100} color="teal" />
                  <Progress.Section value={(ts.inProgress / ts.total) * 100} color="blue" />
                  <Progress.Section value={((ts.open + ts.reopened) / ts.total) * 100} color="gray" />
                </Progress.Root>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                No tasks yet.
              </Text>
            )}
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder padding="md" radius="md">
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Team
          </Text>
          {project.members.length === 0 ? (
            <Text size="sm" c="dimmed">
              No members yet.
            </Text>
          ) : (
            <Stack gap={6}>
              {project.members.map((m) => (
                <Group key={m.id} justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <UserAvatar
                      name={m.user.name}
                      image={m.user.image}
                      size={26}
                      color="blue"
                      style={{ flexShrink: 0 }}
                    />
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {m.user.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {m.user.email}
                      </Text>
                    </Stack>
                  </Group>
                  <Badge color={ROLE_COLOR[m.role] ?? 'gray'} variant="light" size="sm">
                    {m.role}
                  </Badge>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      {githubEnabled && <GithubActivityCard project={project} />}
    </Stack>
  )
}
