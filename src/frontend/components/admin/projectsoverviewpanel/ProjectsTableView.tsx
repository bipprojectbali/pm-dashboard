import { ActionIcon, Badge, Card, Group, Pagination, Progress, Stack, Table, Text, Tooltip } from '@mantine/core'
import { TbExternalLink, TbSearch, TbTarget } from 'react-icons/tb'
import { EmptyRow } from '@/frontend/components/shared/EmptyState'
import type { ProjectListItem } from '../../ProjectsPanel'
import { PAGE_SIZE, PRIORITY_COLOR, STATUS_COLOR, STICKY_PROJECT_CELL, STICKY_PROJECT_HEADER, formatDate, isOverdue } from './constants'

export function ProjectsTableView({
  isLoading,
  filtered,
  pagedFiltered,
  safePage,
  totalPages,
  setPage,
  onSelect,
}: {
  isLoading: boolean
  filtered: ProjectListItem[]
  pagedFiltered: ProjectListItem[]
  safePage: number
  totalPages: number
  setPage: (p: number) => void
  onSelect: (id: string) => void
}) {
  return (
    <Card withBorder padding={0} radius="md">
      <Table.ScrollContainer minWidth={1100}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md" layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={STICKY_PROJECT_HEADER}>Project</Table.Th>
              <Table.Th style={{ width: 180 }}>Owner</Table.Th>
              <Table.Th style={{ width: 120 }}>Status</Table.Th>
              <Table.Th style={{ width: 110 }}>Priority</Table.Th>
              <Table.Th style={{ width: 150 }}>
                <Tooltip label="Jumlah task CLOSED / total task + bar progress. 100% bar berubah hijau.">
                  <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Tasks</span>
                </Tooltip>
              </Table.Th>
              <Table.Th style={{ width: 110 }}>
                <Tooltip label="Milestone = sub-deadline dalam project. Format done / total. '—' = project belum punya milestone.">
                  <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Milestones</span>
                </Tooltip>
              </Table.Th>
              <Table.Th style={{ width: 90 }}>Members</Table.Th>
              <Table.Th style={{ width: 160 }}>Deadline</Table.Th>
              <Table.Th style={{ width: 60 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={9}>
                  <EmptyRow icon={TbTarget} title="Memuat project…" />
                </Table.Td>
              </Table.Tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={9}>
                  <EmptyRow
                    icon={TbSearch}
                    title="Tidak ada project yang cocok"
                    message="Coba ubah filter status/prioritas atau reset pencarian."
                  />
                </Table.Td>
              </Table.Tr>
            )}
            {pagedFiltered.map((p) => {
              const overdue = isOverdue(p)
              const taskTotal = p.taskStats?.total ?? 0
              const taskDone = p.taskStats?.closed ?? 0
              const taskPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0
              const msDone = p.milestoneStats?.done ?? 0
              const msTotal = p.milestoneStats?.total ?? 0
              const extended =
                p.originalEndAt && p.endsAt && new Date(p.endsAt).getTime() !== new Date(p.originalEndAt).getTime()
              return (
                <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(p.id)}>
                  <Table.Td style={STICKY_PROJECT_CELL}>
                    <Stack gap={2}>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {p.name}
                      </Text>
                      {p.description && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {p.description}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{p.owner.name}</Text>
                    <Text size="xs" c="dimmed">
                      {p.owner.email}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[p.status]} variant="light" size="sm">
                      {p.status.replace('_', ' ')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={PRIORITY_COLOR[p.priority]} variant="dot" size="sm">
                      {p.priority}
                    </Badge>
                  </Table.Td>
                  <Table.Td style={{ minWidth: 120 }}>
                    {taskTotal > 0 ? (
                      <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                          {taskDone} / {taskTotal} · {taskPct}%
                        </Text>
                        <Progress value={taskPct} size="xs" color={taskPct === 100 ? 'green' : 'blue'} />
                      </Stack>
                    ) : (
                      <Text size="xs" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {msTotal > 0 ? `${msDone} / ${msTotal}` : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {p._count.members}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Text size="xs" c={overdue ? 'red' : 'dimmed'} fw={overdue ? 600 : undefined}>
                        {formatDate(p.endsAt)}
                      </Text>
                      {extended && (
                        <Tooltip
                          multiline
                          w={260}
                          label={`Deadline diperpanjang dari rencana awal. Original: ${formatDate(p.originalEndAt)}. Indikator schedule slip atau scope creep.`}
                        >
                          <Badge color="grape" variant="light" size="xs">
                            ext
                          </Badge>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(p.id)
                      }}
                      aria-label="Open project"
                    >
                      <TbExternalLink size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {filtered.length > PAGE_SIZE && (
        <Group justify="space-between" p="md">
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} dari {filtered.length}
          </Text>
          <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Card>
  )
}
