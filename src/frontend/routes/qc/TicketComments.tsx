import { Box, Button, Group, Paper, Stack, Text, Textarea } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck } from 'react-icons/tb'
import { notifyError } from '@/frontend/lib/notify'
import type { TicketDetail } from './types'

export function TicketComments({
  comments,
  ticketId,
}: {
  comments: TicketDetail['comments']
  ticketId: string
}) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')

  const commentM = useMutation({
    mutationFn: async (b: string) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: b }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal comment')
      return json
    },
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['qc', 'ticket', ticketId] })
    },
    onError: (err) => notifyError(err),
  })

  return (
    <Box>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb="xs">Comments</Text>
      <Stack gap="sm">
        {comments.map((c) => (
          <Paper key={c.id} withBorder p="xs" radius="sm">
            <Group justify="space-between" mb={4}>
              <Text size="xs" fw={600}>{c.author?.name ?? 'Unknown'}</Text>
              <Text size="xs" c="dimmed">{new Date(c.createdAt).toLocaleString()}</Text>
            </Group>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</Text>
          </Paper>
        ))}
        <Textarea
          placeholder="Add comment…"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end">
          <Button
            size="xs"
            leftSection={<TbCheck size={14} />}
            disabled={!body.trim() || commentM.isPending}
            onClick={() => commentM.mutate(body.trim())}
          >
            Post
          </Button>
        </Group>
      </Stack>
    </Box>
  )
}
