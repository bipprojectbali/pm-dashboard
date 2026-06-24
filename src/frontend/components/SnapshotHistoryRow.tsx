import { Badge, Divider, Group, Stack, Table, Text } from '@mantine/core'
import { useState } from 'react'
import { TbChevronDown, TbChevronUp, TbTrendingDown, TbTrendingUp } from 'react-icons/tb'
import type { DailySnapshotData } from '../../lib/daily-snapshot.types'

export function fmtDate(date: Date | string) {
  const d = new Date(date)
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  return wib.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function DeltaBadge({ now, prev }: { now: number; prev: number }) {
  const d = now - prev
  if (d === 0)
    return (
      <Text size="xs" c="dimmed">
        ±0
      </Text>
    )
  return (
    <Group gap={2} wrap="nowrap">
      {d > 0 ? (
        <TbTrendingUp size={11} color="var(--mantine-color-red-5)" />
      ) : (
        <TbTrendingDown size={11} color="var(--mantine-color-teal-5)" />
      )}
      <Text size="xs" c={d > 0 ? 'red' : 'teal'} fw={600}>
        {d > 0 ? '+' : ''}
        {d}
      </Text>
    </Group>
  )
}

export function SnapshotRow({ snap, prev }: { snap: DailySnapshotData; prev?: DailySnapshotData }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <Table.Tr style={{ cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <Table.Td>
          <Group gap={6} wrap="nowrap">
            {expanded ? <TbChevronUp size={12} /> : <TbChevronDown size={12} />}
            <Text size="xs" fw={500}>
              {fmtDate(snap.date)}
            </Text>
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Text size="xs">{snap.kpi.openTasks}</Text>
            {prev && <DeltaBadge now={snap.kpi.openTasks} prev={prev.kpi.openTasks} />}
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Text size="xs">{snap.kpi.overdueCount}</Text>
            {prev && <DeltaBadge now={snap.kpi.overdueCount} prev={prev.kpi.overdueCount} />}
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Text size="xs">{snap.kpi.velocity7d}</Text>
            {prev && <DeltaBadge now={snap.kpi.velocity7d} prev={prev.kpi.velocity7d} />}
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Text size="xs">{snap.kpi.staleCount}</Text>
            {prev && <DeltaBadge now={snap.kpi.staleCount} prev={prev.kpi.staleCount} />}
          </Group>
        </Table.Td>
        <Table.Td>
          <Badge
            size="xs"
            color={
              snap.risks.severity === 'high'
                ? 'red'
                : snap.risks.severity === 'medium'
                  ? 'orange'
                  : snap.risks.severity === 'low'
                    ? 'yellow'
                    : 'green'
            }
            variant="light"
          >
            {snap.risks.severity}
          </Badge>
        </Table.Td>
      </Table.Tr>

      {expanded && (
        <Table.Tr>
          <Table.Td colSpan={6} style={{ background: 'var(--mantine-color-default-hover)', padding: '12px 16px' }}>
            <Group align="flex-start" gap="xl" wrap="wrap">
              <Stack gap={4} style={{ minWidth: 280, flex: 1 }}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                  Projects ({snap.projects.length})
                </Text>
                {snap.projects.length === 0 && (
                  <Text size="xs" c="dimmed">
                    —
                  </Text>
                )}
                {snap.projects.map((p) => {
                  const prevP = prev?.projects.find((pp) => pp.id === p.id)
                  return (
                    <Group key={p.id} gap={6} wrap="nowrap">
                      <Badge size="xs" variant="light" color={p.pastDue ? 'red' : 'blue'}>
                        {p.grade}
                      </Badge>
                      <Text size="xs" fw={500} truncate style={{ maxWidth: 160 }}>
                        {p.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {p.score}/100
                      </Text>
                      {prevP && <DeltaBadge now={p.score} prev={prevP.score} />}
                      {p.overdueTasks > 0 && (
                        <Badge size="xs" color="red" variant="dot">
                          {p.overdueTasks} OD
                        </Badge>
                      )}
                      {p.blockedTasks > 0 && (
                        <Badge size="xs" color="orange" variant="dot">
                          {p.blockedTasks} BL
                        </Badge>
                      )}
                    </Group>
                  )
                })}
              </Stack>

              <Divider orientation="vertical" />

              <Stack gap={4} style={{ minWidth: 260, flex: 1 }}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                  Tim ({snap.team.length})
                </Text>
                {snap.team.length === 0 && (
                  <Text size="xs" c="dimmed">
                    —
                  </Text>
                )}
                {snap.team.map((u) => {
                  const prevU = prev?.team.find((pu) => pu.userId === u.userId)
                  return (
                    <Group key={u.userId} gap={6} wrap="nowrap">
                      <Text size="xs" fw={500} style={{ minWidth: 90 }} truncate>
                        {u.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {u.open} open
                      </Text>
                      <Text size="xs" c={u.overdue > 0 ? 'red' : 'dimmed'}>
                        {u.overdue} OD
                      </Text>
                      <Text size="xs" c="teal">
                        {u.closed7d}✓
                      </Text>
                      {prevU && <DeltaBadge now={u.open} prev={prevU.open} />}
                      {u.overloaded && (
                        <Badge size="xs" color="red" variant="filled">
                          OL
                        </Badge>
                      )}
                    </Group>
                  )
                })}
              </Stack>
            </Group>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  )
}
