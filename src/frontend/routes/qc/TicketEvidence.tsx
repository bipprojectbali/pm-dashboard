import { ActionIcon, Box, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbExternalLink, TbLink } from 'react-icons/tb'
import { notifyError } from '@/frontend/lib/notify'
import type { TicketDetail } from './types'

export function TicketEvidence({
  evidence,
  ticketId,
}: {
  evidence: TicketDetail['evidence']
  ticketId: string
}) {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')

  const evidenceM = useMutation({
    mutationFn: async (u: string) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/evidence`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal tambah evidence')
      return json
    },
    onSuccess: () => {
      setUrl('')
      queryClient.invalidateQueries({ queryKey: ['qc', 'ticket', ticketId] })
    },
    onError: (err) => notifyError(err),
  })

  return (
    <Box>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb="xs">Evidence</Text>
      <Stack gap="xs">
        {evidence.map((e) => (
          <Group key={e.id} gap="xs" wrap="nowrap">
            <TbLink size={14} />
            <Text component="a" href={e.url} target="_blank" rel="noopener" size="sm" truncate>
              {e.label || e.url}
            </Text>
            <ActionIcon component="a" href={e.url} target="_blank" rel="noopener" variant="subtle" size="sm">
              <TbExternalLink size={12} />
            </ActionIcon>
          </Group>
        ))}
        <Group gap="xs">
          <TextInput
            style={{ flex: 1 }}
            placeholder="https://… (screenshot, log, repro link)"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
          <Button
            size="xs"
            disabled={!url.trim() || evidenceM.isPending}
            onClick={() => evidenceM.mutate(url.trim())}
          >
            Tambah
          </Button>
        </Group>
      </Stack>
    </Box>
  )
}
