import { Alert, Badge, Button, Card, FileButton, Group, ScrollArea, Stack, Table, Text, Textarea } from '@mantine/core'
import { TbAlertTriangle, TbDownload, TbUpload } from 'react-icons/tb'
import { downloadSampleCsv, parseTaskCsv, TASK_CSV_HEADERS, type RowError } from '@/frontend/lib/csv'

type ParsedCsv = ReturnType<typeof parseTaskCsv>

type Props = {
  csvText: string
  onCsvTextChange: (v: string) => void
  onPickFile: (file: File | null) => void
  parsed: ParsedCsv | null
  errorsByRow: Map<number, RowError[]>
  unknownTagsByRow: Map<number, string[]>
  headerErrors: RowError[]
  totalErrors: number
}

export function BulkCsvForm({
  csvText, onCsvTextChange, onPickFile,
  parsed, errorsByRow, unknownTagsByRow, headerErrors, totalErrors,
}: Props) {
  return (
    <>
      <Group gap="xs" wrap="wrap">
        <FileButton onChange={onPickFile} accept=".csv,text/csv">
          {(props) => (
            <Button {...props} variant="light" leftSection={<TbUpload size={14} />}>
              Upload CSV
            </Button>
          )}
        </FileButton>
        <Button variant="subtle" leftSection={<TbDownload size={14} />} onClick={() => downloadSampleCsv()}>
          Download sample
        </Button>
        {csvText && (
          <Button variant="subtle" color="gray" onClick={() => onCsvTextChange('')}>
            Clear
          </Button>
        )}
        <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>
          Header wajib: <code>{TASK_CSV_HEADERS.join(',')}</code>
        </Text>
      </Group>
      <Textarea
        label="Atau paste CSV di sini"
        placeholder={`title,description,kind,priority,startsAt,dueAt,estimateHours,assigneeEmail,tagNames\n"Login flow","Email + OAuth",TASK,HIGH,2026-04-25,2026-05-02,6.5,,frontend;auth`}
        value={csvText}
        onChange={(e) => onCsvTextChange(e.currentTarget.value)}
        autosize
        minRows={4}
        maxRows={10}
        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
      />
      {parsed && (
        <>
          {headerErrors.length > 0 && (
            <Alert color="red" icon={<TbAlertTriangle size={14} />} title="Header invalid">
              <Stack gap={2}>
                {headerErrors.map((e) => (
                  <Text key={`${e.field}:${e.message}`} size="xs">
                    {e.message}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}
          {parsed.rows.length > 0 && (
            <Card withBorder padding="xs" radius="md">
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={500}>
                  Preview &middot; {parsed.rows.length} baris
                </Text>
                <Badge color={totalErrors > 0 ? 'red' : 'green'} variant="light">
                  {totalErrors > 0 ? `${totalErrors} error` : 'siap import'}
                </Badge>
              </Group>
              <ScrollArea h={260}>
                <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>#</Table.Th>
                      <Table.Th>Title</Table.Th>
                      <Table.Th>Kind</Table.Th>
                      <Table.Th>Priority</Table.Th>
                      <Table.Th>Start</Table.Th>
                      <Table.Th>Due</Table.Th>
                      <Table.Th>Est (h)</Table.Th>
                      <Table.Th>Assignee</Table.Th>
                      <Table.Th>Tags</Table.Th>
                      <Table.Th>Fase</Table.Th>
                      <Table.Th>Errors</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {parsed.rows.map((row, i) => {
                      const errs = errorsByRow.get(i) ?? []
                      const unknownTags = unknownTagsByRow.get(i) ?? []
                      const hasError = errs.length > 0 || unknownTags.length > 0
                      return (
                        <Table.Tr
                          // biome-ignore lint/suspicious/noArrayIndexKey: CSV preview rows have no stable ID; index pairs with errorsByRow Map keyed by index
                          key={`row-${i}-${row.title}`}
                          style={{ backgroundColor: hasError ? 'var(--mantine-color-red-light)' : undefined }}
                        >
                          <Table.Td>{i + 1}</Table.Td>
                          <Table.Td style={{ maxWidth: 220 }}>
                            <Text size="xs" lineClamp={2}>
                              {row.title || (
                                <Text component="span" c="red">
                                  (missing)
                                </Text>
                              )}
                            </Text>
                          </Table.Td>
                          <Table.Td>{row.kind}</Table.Td>
                          <Table.Td>{row.priority}</Table.Td>
                          <Table.Td>{row.startsAt ? row.startsAt.slice(0, 10) : '—'}</Table.Td>
                          <Table.Td>{row.dueAt ? row.dueAt.slice(0, 10) : '—'}</Table.Td>
                          <Table.Td>{row.estimateHours ?? '—'}</Table.Td>
                          <Table.Td>{row.assigneeEmail ?? '—'}</Table.Td>
                          <Table.Td>{row.tagNames.join(', ') || '—'}</Table.Td>
                          <Table.Td>{row.phaseTitle || '—'}</Table.Td>
                          <Table.Td>
                            {hasError ? (
                              <Stack gap={2}>
                                {errs.map((e) => (
                                  <Text key={`${e.field}:${e.message}`} size="xs" c="red">
                                    {e.field}: {e.message}
                                  </Text>
                                ))}
                                {unknownTags.length > 0 && (
                                  <Text size="xs" c="red">
                                    tag tidak ada di project: {unknownTags.join(', ')}
                                  </Text>
                                )}
                              </Stack>
                            ) : (
                              <Text size="xs" c="green">
                                ok
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Card>
          )}
        </>
      )}
    </>
  )
}
