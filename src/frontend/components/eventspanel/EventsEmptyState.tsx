import { Button, Card, Stack, Text, ThemeIcon } from '@mantine/core'
import { TbCalendarEvent, TbPlus } from 'react-icons/tb'

type Props = {
  filterTagId: string | null
  showAll: boolean
  onShowAll: () => void
  onCreate: () => void
}

export function EventsEmptyState({ filterTagId, showAll, onShowAll, onCreate }: Props) {
  return (
    <Card withBorder radius="md" p="xl">
      <Stack align="center" gap="xs">
        <ThemeIcon size="xl" radius="xl" variant="light" color="blue">
          <TbCalendarEvent size={24} />
        </ThemeIcon>
        <Text fw={600}>
          {filterTagId
            ? 'Tidak ada event dengan tag ini'
            : showAll
              ? 'Belum ada event'
              : 'Tidak ada event mendatang'}
        </Text>
        <Text size="sm" c="dimmed">
          {!filterTagId && !showAll
            ? 'Event yang sudah lewat disembunyikan. Klik "Semua event" untuk melihat semua.'
            : 'Buat event pertama untuk mengingatkan tim.'}
        </Text>
        {!filterTagId && !showAll && (
          <Button size="xs" variant="subtle" onClick={onShowAll}>
            Tampilkan semua event
          </Button>
        )}
        <Button size="sm" leftSection={<TbPlus size={14} />} onClick={onCreate} mt="xs">
          Buat Event
        </Button>
      </Stack>
    </Card>
  )
}
